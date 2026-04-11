import logging
from typing import Optional
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models import Chunk, Document, GoldenAnswer
from app.services.embedding import embedding_service

logger = logging.getLogger(__name__)


async def get_latest_document_for_user(db, user_id) -> Optional[Document]:
    """Fetches the most recently uploaded document for a specific user."""
    stmt = (
        select(Document)
        .where(Document.user_id == user_id)
        .order_by(Document.upload_date.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def check_golden_bank(db, user_id, question_embedding, threshold: float = 0.10):
    """
    Check Layer B (Golden Q&A Bank) for a semantically similar question.
    Returns the GoldenAnswer if cosine distance < threshold (i.e. >90% similarity),
    or None if no match.
    """
    stmt = (
        select(
            GoldenAnswer,
            GoldenAnswer.question_embedding.cosine_distance(
                question_embedding).label("distance"),
        )
        .where(GoldenAnswer.user_id == user_id)
        .order_by(GoldenAnswer.question_embedding.cosine_distance(question_embedding))
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.first()
    if row and row.distance < threshold:
        logger.info(f"Golden Bank HIT — distance={row.distance:.4f}")
        return row.GoldenAnswer
    return None


async def get_relevant_context(question: str, top_k: int = 5, user_id=None) -> str:
    """Embeds the user's question and performs a cosine similarity search in pgvector.
    When user_id is provided, scopes search to that user's latest document."""
    try:
        vector_result = await embedding_service.generate_embeddings([question])
        question_vector = vector_result[0]

        async with AsyncSessionLocal() as db:
            query = select(Chunk).order_by(
                Chunk.embedding.cosine_distance(question_vector)
            )

            # Tenant-scoped: filter to user's latest document
            if user_id:
                latest_doc = await get_latest_document_for_user(db, user_id)
                if latest_doc:
                    query = query.where(
                        Chunk.user_id == user_id,
                        Chunk.document_id == latest_doc.id,
                    )
                else:
                    # User has no documents — fall back to global search
                    logger.warning(
                        f"No documents found for user {user_id}, falling back to global search")

            query = query.limit(top_k)
            result = await db.execute(query)
            top_chunks = result.scalars().all()

            if not top_chunks:
                return "No relevant context found."

            context = "\n\n---\n\n".join(
                [chunk.content for chunk in top_chunks])
            return context
    except Exception as e:
        logger.error(f"Error retrieving context: {str(e)}")
        return "Error retrieving context."
