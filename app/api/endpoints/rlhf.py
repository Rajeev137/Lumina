import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import GoldenAnswer, BatchRun
from app.api.schemas import FeedbackRequest
from app.api.dependencies import CurrentUser
from app.services.embedding import embedding_service

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Submit feedback for a single Q&A pair ─────────────────────────────────────

@router.post("/feedback")
async def submit_rlhf_feedback(
    payload: FeedbackRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    RLHF feedback endpoint:
    - approved: embed the question and push Q&A pair to the Golden Bank (Layer B)
    - rejected: log for future chunk down-ranking
    - neutral: no-op (default state)
    """
    status = payload.status.lower()

    if status not in ("approved", "rejected", "neutral"):
        raise HTTPException(
            status_code=400,
            detail="Status must be 'approved', 'rejected', or 'neutral'.",
        )

    if status == "approved":
        try:
            # Use the query-prefixed embedding so stored golden questions live in
            # the same space that incoming questions are compared against in
            # check_golden_bank (see retrieve_node).
            q_embedding = await embedding_service.generate_query_embedding(payload.question)

            golden = GoldenAnswer(
                user_id=current_user.id,
                question=payload.question,
                question_embedding=q_embedding,
                answer=payload.answer,
                source_question=payload.question,
            )
            db.add(golden)
            await db.commit()
            logger.info(f"Golden answer added for user {current_user.id}")
            return {"message": "Answer approved and added to Golden Q&A Bank."}
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to add golden answer: {e}")
            raise HTTPException(
                status_code=500, detail="Failed to store approved answer.")

    if status == "rejected":
        logger.info(
            f"Answer rejected by user {current_user.id} — feedback logged.")
        return {"message": "Feedback recorded. Generation path penalized."}

    return {"message": "Neutral — no action taken."}


# ── Pending review: batch runs that still have unreviewed answers ─────────────

@router.get("/pending")
async def list_pending_reviews(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """List batch runs for the current user (most recent first).
    The frontend tracks per-answer review state in localStorage and uses this
    list to decide which batch runs still need attention."""
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
            "answers": r.answers or [],
        }
        for r in rows
    ]


# ── Golden Answers management ─────────────────────────────────────────────────

@router.get("/golden")
async def list_golden_answers(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(
        None, description="Search query for question or answer text"),
):
    """List all golden answers for the current user. Optionally filter by search text."""
    stmt = (
        select(GoldenAnswer)
        .where(GoldenAnswer.user_id == current_user.id)
    )
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                GoldenAnswer.question.ilike(pattern),
                GoldenAnswer.answer.ilike(pattern),
            )
        )
    stmt = stmt.order_by(GoldenAnswer.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(r.id),
            "question": r.question,
            "answer": r.answer,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.delete("/golden/{golden_id}")
async def revoke_golden_answer(
    golden_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Remove a golden answer (e.g. if it was approved by mistake)."""
    ga = await db.get(GoldenAnswer, golden_id)
    if not ga or ga.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Golden answer not found.")
    await db.delete(ga)
    await db.commit()
    logger.info(f"Golden answer {golden_id} revoked by user {current_user.id}")
    return {"deleted": True, "id": golden_id}
