import logging
from typing import Optional
from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal
from app.db.models import Chunk, Document, GoldenAnswer
from app.services.embedding import embedding_service

logger = logging.getLogger(__name__)

# Reciprocal Rank Fusion constant. Standard default; dampens the influence of
# very-top ranks so a chunk that ranks decently in BOTH lists can beat one that
# ranks #1 in only a single list.
RRF_K = 60


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


def _apply_tenant_scope(query, user_id, latest_doc):
    """Apply the same tenant filter to both the vector and FTS legs so they
    search identical candidate sets. Returns the (possibly unfiltered) query."""
    if user_id and latest_doc:
        return query.where(
            Chunk.user_id == user_id,
            Chunk.document_id == latest_doc.id,
        )
    return query


async def get_relevant_context(question: str, top_k: int = 5, user_id=None) -> str:
    """Hybrid retrieval: combines semantic (pgvector cosine) and keyword (Postgres
    full-text) search via Reciprocal Rank Fusion, then returns the top_k chunks'
    text. Scoped to the user's latest document when user_id is provided."""
    try:
        # bge wants the query-instruction prefix for best retrieval quality.
        question_vector = await embedding_service.generate_query_embedding(question)
        # websearch_to_tsquery is forgiving of free-form input (won't error on
        # punctuation/operators the way plainto_/to_tsquery can).
        ts_query = func.websearch_to_tsquery("english", question)

        # Pull a wider candidate pool from each leg than top_k, so RRF has room
        # to promote chunks that rank moderately-well in both.
        candidate_k = max(top_k * 4, 20)

        async with AsyncSessionLocal() as db:
            latest_doc = None
            if user_id:
                latest_doc = await get_latest_document_for_user(db, user_id)
                if not latest_doc:
                    logger.warning(
                        f"No documents found for user {user_id}, falling back to global search")

            # ── Leg 1: semantic (vector cosine) ──────────────────────────────
            vec_query = select(Chunk.id, Chunk.content).order_by(
                Chunk.embedding.cosine_distance(question_vector)
            )
            vec_query = _apply_tenant_scope(vec_query, user_id, latest_doc).limit(candidate_k)
            vec_rows = (await db.execute(vec_query)).all()

            # ── Leg 2: keyword (full-text) ───────────────────────────────────
            fts_query = (
                select(Chunk.id, Chunk.content)
                .where(Chunk.fts_vector.op("@@")(ts_query))
                .order_by(func.ts_rank(Chunk.fts_vector, ts_query).desc())
            )
            fts_query = _apply_tenant_scope(fts_query, user_id, latest_doc).limit(candidate_k)
            fts_rows = (await db.execute(fts_query)).all()

            # ── Reciprocal Rank Fusion ───────────────────────────────────────
            # Each chunk scores sum(1 / (RRF_K + rank)) over the lists it appears
            # in (rank is 0-indexed position). Chunks in both lists rise to the top.
            scores: dict = {}
            content_by_id: dict = {}
            for ranked in (vec_rows, fts_rows):
                for rank, row in enumerate(ranked):
                    scores[row.id] = scores.get(row.id, 0.0) + 1.0 / (RRF_K + rank)
                    content_by_id[row.id] = row.content

            if not scores:
                return "No relevant context found."

            top_ids = sorted(scores, key=scores.get, reverse=True)[:top_k]
            context = "\n\n---\n\n".join(content_by_id[cid] for cid in top_ids)
            return context
    except Exception as e:
        logger.error(f"Error retrieving context: {str(e)}")
        return "Error retrieving context."
