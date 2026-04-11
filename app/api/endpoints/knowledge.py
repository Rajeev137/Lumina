import logging
import tempfile
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Depends
from sqlalchemy import select, func
from app.services.document_parser import document_parser
from app.services.ingestion import ingestion_service
from app.services.job_store import create_job, update_job, get_job
from app.db.session import AsyncSessionLocal
from app.db.models import Document, Chunk
from app.api.dependencies import CurrentUser

router = APIRouter()
logger = logging.getLogger(__name__)

# Allowed file types for upload
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".html"}


async def process_upload_background(file_path: str, original_filename: str, job_id: str, user_id=None):
    """Background task: parse → chunk → embed → store in Postgres."""
    await update_job(job_id, "IN_PROGRESS", progress_percentage=5, message="Starting document parsing…")
    path = Path(file_path)

    async def _status_cb(status: str, pct: int, msg: str):
        await update_job(job_id, status, progress_percentage=pct, message=msg)

    try:
        # Step 1: Parse the document via PyMuPDF (runs in thread pool internally)
        await update_job(job_id, "PARSING", progress_percentage=5, message="Parsing document…")
        parsed_doc = await document_parser.parse_document(path)
        await update_job(job_id, "PARSING", progress_percentage=15, message="Document parsed.")

        # Step 2: Ingest — chunk, embed, and bulk insert into Postgres
        async with AsyncSessionLocal() as db:
            document_id = await ingestion_service.ingest_document(
                db, parsed_doc, status_callback=_status_cb, user_id=user_id,
                original_filename=original_filename,
            )

        await update_job(job_id, "COMPLETED", result={
            "document_id": document_id,
            "filename": original_filename,
        }, progress_percentage=100, message="Ingestion complete.")
        logger.info(
            f"Upload job {job_id} completed. Document ID: {document_id}")

    except Exception as e:
        logger.error(f"Upload job {job_id} failed: {str(e)}")
        await update_job(job_id, "FAILED", result={"error": str(e)}, progress_percentage=0, message=str(e))

    finally:
        # Always clean up the temp file regardless of success or failure
        if path.exists():
            path.unlink()


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    """
    Upload a document (PDF, DOCX, etc.) for ingestion into the knowledge base.
    Returns a job_id immediately. Poll /knowledge/status/{job_id} for progress.
    """
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Save to a temp file so the background task can access it after this request closes
    # UploadFile's buffer is tied to the request lifecycle — we must persist it first
    # Use await file.read() (async) instead of shutil.copyfileobj (sync) to ensure
    # the SpooledTemporaryFile buffer is fully flushed before writing.
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name
    finally:
        tmp.close()
        await file.close()

    job_id = await create_job(job_type="knowledge_ingestion", user_id=current_user.id)
    background_tasks.add_task(
        process_upload_background, tmp_path, file.filename, job_id,
        user_id=current_user.id,
    )

    return {
        "job_id": job_id,
        "filename": file.filename,
        "message": "Document queued for ingestion. Poll /knowledge/status/{job_id} for updates."
    }


@router.get("/status/{job_id}")
async def get_upload_status(job_id: str):
    """Check the processing status of an uploaded document."""
    job_data = await get_job(job_id)
    if job_data["status"] == "NOT_FOUND":
        raise HTTPException(status_code=404, detail="Job ID not found.")
    response = {
        "job_id": job_id,
        "status": job_data["status"],
        "progress_percentage": job_data.get("progress_percentage", 0),
        "message": job_data.get("message", ""),
    }
    # Expose error details so FAILED jobs are debuggable
    if job_data["status"] == "FAILED" and job_data.get("result"):
        response["error"] = job_data["result"]
    return response


@router.get("/result/{job_id}")
async def get_upload_result(job_id: str):
    """Retrieve the result of a completed ingestion job."""
    job_data = await get_job(job_id)
    if job_data["status"] == "NOT_FOUND":
        raise HTTPException(status_code=404, detail="Job ID not found.")
    if job_data["status"] != "COMPLETED":
        raise HTTPException(
            status_code=400,
            detail=f"Job Current status: {job_data['status']}"
        )
    return {"job_id": job_id, **job_data["result"]}


@router.get("/documents")
async def list_documents(current_user: CurrentUser):
    """List all ingested documents with chunk counts for the current user."""
    async with AsyncSessionLocal() as db:
        stmt = (
            select(
                Document.id,
                Document.filename,
                Document.upload_date,
                func.count(Chunk.id).label("chunk_count"),
            )
            .outerjoin(Chunk, Chunk.document_id == Document.id)
            .where(Document.user_id == current_user.id)
            .group_by(Document.id)
            .order_by(Document.upload_date.desc())
        )
        rows = (await db.execute(stmt)).all()
        return [
            {
                "id": str(row.id),
                "filename": row.filename,
                "uploaded_at": row.upload_date.isoformat() if row.upload_date else None,
                "chunk_count": row.chunk_count,
            }
            for row in rows
        ]


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: CurrentUser):
    """Delete a document and all its chunks from the knowledge base."""
    async with AsyncSessionLocal() as db:
        doc = await db.get(Document, document_id)
        if not doc or doc.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Document not found.")
        await db.delete(doc)
        await db.commit()
        logger.info(f"Deleted document {document_id} ({doc.filename})")
        return {"deleted": True, "document_id": document_id, "filename": doc.filename}
