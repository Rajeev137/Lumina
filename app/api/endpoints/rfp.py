from app.core.config import settings
import json
import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
import asyncio
import io
import pandas as pd
from sqlalchemy import select

from pydantic import BaseModel
from app.agents.graph import lumina_agent
from app.db.session import AsyncSessionLocal
from app.db.models import BatchRun
from app.services.job_store import create_job, update_job, get_job
from app.api.dependencies import CurrentUser

router = APIRouter()
logger = logging.getLogger(__name__)


class RFPRequest(BaseModel):
    question: str


async def process_rfp_background(question: str, job_id: str, user_id=None):
    """Background task that run langGraph loop"""
    await update_job(job_id, "IN_PROGRESS")
    try:
        # initialize state for langGraph
        initial_state = {
            "rfp_question": question,
            "user_id": str(user_id) if user_id else None,
            "draft_generated": 0,
            "status": "DRAFTING"
        }

        # run the agentic loop
        final_state = await lumina_agent.ainvoke(initial_state)

        # save output
        await update_job(job_id, "COMPLETED",
                         result=final_state.get("final_output", {}))
    except Exception as e:
        logger.error(f"Job {job_id} failed: {str(e)}")
        await update_job(job_id, "FAILED", result={"error": str(e)})


@router.post("/process")
async def submit_rfp_question(
    payload: RFPRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
):
    """Endpoint to submit RFP question and start processing."""
    job_id = await create_job(job_type="rfp_batch", user_id=current_user.id)
    background_tasks.add_task(
        process_rfp_background, payload.question, job_id,
        user_id=current_user.id,
    )
    return {"job_id": job_id, "message": "RFP question queued for processing."}


@router.get("/status/{job_id}")
async def get_rfp_status(job_id: str):
    """Endpoint to check the status of a submitted RFP question."""
    job_data = await get_job(job_id)
    if job_data["status"] == "NOT_FOUND":
        raise HTTPException(status_code=404, detail="Job ID not found.")
    response = {"job_id": job_id, "status": job_data["status"]}
    # Expose error details so FAILED jobs are debuggable
    if job_data["status"] == "FAILED" and job_data.get("result"):
        response["error"] = job_data["result"]
    return response


@router.get("/download/{job_id}")
async def download_rfp_result(job_id: str):
    """Endpoint to download the final response after processing."""
    job_data = await get_job(job_id)
    if job_data["status"] != "COMPLETED":
        raise HTTPException(
            status_code=400, detail=f"Job is currently {job_data['status']}")
    return job_data["result"]


# ── Batch Processing ──────────────────────────────────────────────────────────

# Conservative concurrency to avoid 429 rate-limit / overloaded errors from
# burst-firing the Claude API.
MAX_CONCURRENT_AGENTS = 2 if settings.USE_LOCAL_LLM else 3

# Seconds to wait between finishing one question and starting the next.
# Spreads Claude API load across the rate-limit window.
INTER_QUESTION_DELAY = 2.0


async def process_single_question(question: str, semaphore: asyncio.Semaphore, user_id=None) -> dict:
    """Runs one agent invocation, gated by the semaphore."""
    async with semaphore:
        try:
            initial_state = {
                "rfp_question": question,
                "user_id": str(user_id) if user_id else None,
                "draft_generated": 0,
                "status": "DRAFTING"
            }
            final_state = await lumina_agent.ainvoke(initial_state)
            return final_state.get("final_output", {"question": question, "error": "No output generated"})
        except Exception as e:
            logger.error(
                f"Failed processing question '{question[:50]}': {str(e)}")
            return {"question": question, "error": str(e)}
        finally:
            # Delay before releasing the semaphore so the next question
            # doesn't fire immediately — spreads Claude API load.
            await asyncio.sleep(INTER_QUESTION_DELAY)


async def process_batch_background(job_id: str, questions: list[str], user_id=None):
    """Background task: runs all questions concurrently up to MAX_CONCURRENT_AGENTS at a time."""
    await update_job(job_id, "IN_PROGRESS")
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_AGENTS)
    try:
        tasks = [process_single_question(
            q, semaphore, user_id=user_id) for q in questions]
        results = await asyncio.gather(*tasks)
        await update_job(job_id, "COMPLETED", result={
            "total": len(results), "answers": list(results)})
        logger.info(
            f"Batch job {job_id} completed — {len(results)} questions processed.")
    except Exception as e:
        logger.error(f"Batch job {job_id} failed: {str(e)}")
        await update_job(job_id, "FAILED", result={"error": str(e)})


@router.post("/batch-upload")
async def upload_rfp_excel(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    file: UploadFile = File(...)
):
    """
    Upload an Excel (.xlsx) RFP template (e.g. CAIQ).
    Detects a 'Question' column automatically, or falls back to the first column.
    Returns a job_id to poll for all answers.
    """
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(
            status_code=400, detail="Only .xlsx files are supported.")

    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))

        if df.empty:
            raise HTTPException(
                status_code=400, detail="The Excel file is empty.")

        # Find a column named 'Question' (case-insensitive), else use first column
        question_col = next(
            (col for col in df.columns if "question" in col.lower()), None)
        if not question_col:
            question_col = df.columns[0]
            logger.warning(
                f"No 'Question' column found — using first column: '{question_col}'")

        questions = df[question_col].dropna().astype(str).tolist()

        if not questions:
            raise HTTPException(
                status_code=400, detail="No valid questions found in the file.")

        job_id = await create_job(job_type="rfp_batch", user_id=current_user.id)
        background_tasks.add_task(
            process_batch_background, job_id, questions,
            user_id=current_user.id,
        )

        return {
            "job_id": job_id,
            "questions_detected": len(questions),
            "column_used": question_col,
            "concurrency": MAX_CONCURRENT_AGENTS,
            "message": f"{len(questions)} questions queued. Poll /rfp/status/{job_id} for progress."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Excel parsing failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to parse Excel file: {str(e)}")


# ── SSE Streaming ─────────────────────────────────────────────────────────────

NODE_LABELS = {
    "retrieve": "Retrieving context from knowledge base…",
    "draft": "Drafting response…",
    "verify": "Verifying answer for accuracy…",
    "finalize": "Finalizing output…",
}


@router.post("/stream")
async def stream_rfp_question(payload: RFPRequest, current_user: CurrentUser):
    """SSE endpoint: streams LangGraph node transitions for a single RFP question."""

    user_id = str(current_user.id)

    async def event_generator():
        initial_state = {
            "rfp_question": payload.question,
            "user_id": user_id,
            "draft_generated": 0,
            "status": "DRAFTING",
        }
        draft_count = 0
        final_output = None

        try:
            async for event in lumina_agent.astream(initial_state):
                for node_name, state_update in event.items():
                    if node_name == "__end__":
                        continue
                    if node_name == "draft":
                        draft_count += 1
                    if "final_output" in state_update:
                        final_output = state_update["final_output"]

                    sse_data = {
                        "node": node_name,
                        "message": NODE_LABELS.get(node_name, f"Running {node_name}…"),
                        "draft_count": draft_count,
                    }
                    if "status" in state_update:
                        sse_data["agent_status"] = state_update["status"]

                    yield f"event: node\ndata: {json.dumps(sse_data)}\n\n"

            yield f"event: done\ndata: {json.dumps({'result': final_output})}\n\n"

        except Exception as e:
            logger.error(f"SSE stream error: {e}")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/batch-stream")
async def stream_rfp_batch(current_user: CurrentUser, file: UploadFile = File(...)):
    """SSE endpoint: streams per-question progress for batch RFP processing."""
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(
            status_code=400, detail="Only .xlsx files are supported.")

    original_filename = file.filename
    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))

    if df.empty:
        raise HTTPException(status_code=400, detail="The Excel file is empty.")

    question_col = next(
        (col for col in df.columns if "question" in col.lower()), None
    )
    if not question_col:
        question_col = df.columns[0]

    questions = df[question_col].dropna().astype(str).tolist()

    if not questions:
        raise HTTPException(
            status_code=400, detail="No valid questions found.")

    async def event_generator():
        total = len(questions)
        all_answers: list[dict] = []
        user_id = str(current_user.id)

        yield f"event: batch_start\ndata: {json.dumps({'total': total, 'column': question_col})}\n\n"

        for qi, question in enumerate(questions):
            initial_state = {
                "rfp_question": question,
                "user_id": user_id,
                "draft_generated": 0,
                "status": "DRAFTING",
            }
            draft_count = 0
            final_output = None

            try:
                async for event in lumina_agent.astream(initial_state):
                    for node_name, state_update in event.items():
                        if node_name == "__end__":
                            continue
                        if node_name == "draft":
                            draft_count += 1
                        if "final_output" in state_update:
                            final_output = state_update["final_output"]

                        sse_data = {
                            "question_index": qi,
                            "total": total,
                            "question_preview": question[:100],
                            "node": node_name,
                            "message": NODE_LABELS.get(node_name, f"Running {node_name}…"),
                            "draft_count": draft_count,
                        }
                        if "status" in state_update:
                            sse_data["agent_status"] = state_update["status"]

                        yield f"event: node\ndata: {json.dumps(sse_data)}\n\n"

                result = final_output or {
                    "question": question,
                    "error": "No output generated",
                }
                all_answers.append(result)
                yield f"event: question_done\ndata: {json.dumps({'question_index': qi, 'total': total, 'result': result})}\n\n"

            except Exception as e:
                err_result = {"question": question, "error": str(e)}
                all_answers.append(err_result)
                yield f"event: question_done\ndata: {json.dumps({'question_index': qi, 'total': total, 'result': err_result})}\n\n"

            # Delay between questions to spread Claude API load and avoid 429s
            if qi < total - 1:
                await asyncio.sleep(INTER_QUESTION_DELAY)

        # Persist batch run to Postgres so it survives tab switches / restarts
        try:
            async with AsyncSessionLocal() as db:
                run = BatchRun(
                    filename=original_filename,
                    question_count=total,
                    answers=all_answers,
                    user_id=current_user.id,
                )
                db.add(run)
                await db.commit()
                await db.refresh(run)
                batch_id = str(run.id)
        except Exception as save_err:
            logger.error(f"Failed to persist batch run: {save_err}")
            batch_id = None

        yield f"event: done\ndata: {json.dumps({'total': total, 'answers': all_answers, 'batch_id': batch_id})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Batch History ─────────────────────────────────────────────────────────────

@router.get("/batch-history")
async def list_batch_runs(current_user: CurrentUser):
    """List all saved batch runs (most recent first) for the current user."""
    async with AsyncSessionLocal() as db:
        stmt = (
            select(BatchRun)
            .where(BatchRun.user_id == current_user.id)
            .order_by(BatchRun.created_at.desc())
        )
        rows = (await db.execute(stmt)).scalars().all()
        return [
            {
                "id": str(r.id),
                "filename": r.filename,
                "question_count": r.question_count,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "answer_count": len(r.answers) if r.answers else 0,
            }
            for r in rows
        ]


@router.get("/batch-history/{run_id}")
async def get_batch_run(run_id: str, current_user: CurrentUser):
    """Fetch the full answers for a specific batch run."""
    async with AsyncSessionLocal() as db:
        run = await db.get(BatchRun, run_id)
        if not run or run.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Batch run not found.")
        return {
            "id": str(run.id),
            "filename": run.filename,
            "question_count": run.question_count,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "answers": run.answers,
        }


@router.delete("/batch-history/{run_id}")
async def delete_batch_run(run_id: str, current_user: CurrentUser):
    """Delete a saved batch run."""
    async with AsyncSessionLocal() as db:
        run = await db.get(BatchRun, run_id)
        if not run or run.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Batch run not found.")
        await db.delete(run)
        await db.commit()
        logger.info(f"Deleted batch run {run_id} ({run.filename})")
        return {"deleted": True, "run_id": run_id, "filename": run.filename}
