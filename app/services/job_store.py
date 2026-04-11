import json
import uuid
import logging
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import AsyncSessionLocal
from app.db.models import Job

logger = logging.getLogger(__name__)


async def create_job(job_type: str = "knowledge_ingestion", user_id=None) -> str:
    """Create a new job record in the database and return its ID."""
    async with AsyncSessionLocal() as db:
        job = Job(
            job_type=job_type,
            status="PENDING",
            progress_percentage=0,
            message="Queued",
            user_id=user_id,
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)
        return str(job.id)


async def update_job(
    job_id: str,
    status: str,
    result: dict = None,
    progress_percentage: Optional[int] = None,
    message: Optional[str] = None,
):
    """Update an existing job record in the database."""
    async with AsyncSessionLocal() as db:
        stmt = select(Job).where(Job.id == job_id)
        row = (await db.execute(stmt)).scalar_one_or_none()
        if not row:
            logger.warning(f"update_job: job {job_id} not found")
            return
        row.status = status
        if result is not None:
            row.result_data = result
        if progress_percentage is not None:
            row.progress_percentage = progress_percentage
        if message is not None:
            row.message = message
        if status == "FAILED" and result:
            row.error = result.get("error") if isinstance(
                result, dict) else str(result)
        await db.commit()


async def get_job(job_id: str) -> dict:
    """Retrieve job state from the database, returns dict matching old in-memory format."""
    async with AsyncSessionLocal() as db:
        stmt = select(Job).where(Job.id == job_id)
        row = (await db.execute(stmt)).scalar_one_or_none()
        if not row:
            return {"status": "NOT_FOUND"}
        return {
            "status": row.status,
            "result": row.result_data,
            "progress_percentage": row.progress_percentage or 0,
            "message": row.message or "",
        }
