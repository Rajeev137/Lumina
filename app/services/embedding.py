import asyncio
import logging
from typing import AsyncIterator
from sentence_transformers import SentenceTransformer
from app.core.config import settings

logger = logging.getLogger(__name__)

# bge-large-en-v1.5 recommends prefixing *queries* (not passages) with this
# instruction to get its best retrieval quality. Passages are embedded as-is.
BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

# Load the model once at import time. First run downloads ~1.3GB to the HF cache;
# subsequent runs load from disk. CPU by default; picks up a GPU automatically if
# one is present (via the underlying torch device).
logger.info(f"Loading embedding model: {settings.EMBEDDING_MODEL_ID}")
_model = SentenceTransformer(settings.EMBEDDING_MODEL_ID)


def _encode(texts: list[str]) -> list[list[float]]:
    """Synchronous encode — normalized vectors so cosine distance is well-behaved."""
    vectors = _model.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return vectors.tolist()


class EmbeddingService:
    async def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Embed passages/documents. Runs the sync model in a thread so the
        FastAPI event loop isn't blocked."""
        if not texts:
            return []
        return await asyncio.to_thread(_encode, texts)

    async def generate_query_embedding(self, query: str) -> list[float]:
        """Embed a search query with the bge query instruction prefix.
        Use this for the incoming RFP question, not for stored chunks."""
        prefixed = BGE_QUERY_INSTRUCTION + query
        vectors = await asyncio.to_thread(_encode, [prefixed])
        return vectors[0]

    async def generate_embeddings_in_batches(
        self,
        texts: list[str],
        batch_size: int = 100,
    ) -> AsyncIterator[tuple[int, list[list[float]]]]:
        """
        Yield (batch_start_index, embeddings) for successive slices of *texts*.
        Batching turns many small encodes into fewer large matrix multiplies.
        """
        for start in range(0, len(texts), batch_size):
            batch = texts[start: start + batch_size]
            embeddings = await asyncio.to_thread(_encode, batch)
            yield start, embeddings


embedding_service = EmbeddingService()
