import logging
from typing import AsyncIterator
from google import genai
from google.genai import types
from app.core.config import settings

logger = logging.getLogger(__name__)

# Configure the Gemini SDK once at module level
client = genai.Client(api_key=settings.GEMINI_API_KEY)

# Embedding config: truncate to 768 dims for pgvector storage efficiency
_embed_config = types.EmbedContentConfig(output_dimensionality=768)


class EmbeddingService:
    async def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        result = await client.aio.models.embed_content(
            model=settings.EMBEDDING_MODEL_ID,
            contents=texts,
            config=_embed_config,
        )
        return [e.values for e in result.embeddings]

    async def generate_embeddings_in_batches(
        self,
        texts: list[str],
        batch_size: int = 100,
    ) -> AsyncIterator[tuple[int, list[list[float]]]]:
        """
        Yield (batch_start_index, embeddings) for successive slices of *texts*.
        Google's embed_content supports up to 100 texts per call.
        """
        for start in range(0, len(texts), batch_size):
            batch = texts[start: start + batch_size]
            result = await client.aio.models.embed_content(
                model=settings.EMBEDDING_MODEL_ID,
                contents=batch,
                config=_embed_config,
            )
            yield start, [e.values for e in result.embeddings]


embedding_service = EmbeddingService()
