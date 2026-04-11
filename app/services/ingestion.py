import uuid
import logging
from typing import Callable, Awaitable, Optional
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_text_splitters import MarkdownTextSplitter
from app.db.models import Document, Chunk
from app.services.embedding import embedding_service

logger = logging.getLogger(__name__)

# Type alias for the optional progress callback
StatusCallback = Optional[Callable[[str, int, str], Awaitable[None]]]

EMBED_BATCH_SIZE = 100
INSERT_BATCH_SIZE = 500


class IngestionService:
    def __init__(self):
        # Markdown-aware splitter: respects headers, tables, code blocks and lists
        # instead of blindly slicing mid-table/mid-sentence like RecursiveCharacterTextSplitter
        self.text_splitter = MarkdownTextSplitter(
            chunk_size=2000,
            chunk_overlap=200,
        )

    async def ingest_document(
        self,
        db: AsyncSession,
        parsed_doc: dict,
        status_callback: StatusCallback = None,
        user_id=None,
        original_filename: str | None = None,
    ) -> str:
        """
        Takes the parsed dictionary, chunks the markdown, 
        embeds it in batches, and bulk-inserts into Postgres.
        """
        filename = original_filename or parsed_doc["filename"]
        raw_markdown = parsed_doc["raw_markdown"]
        doc_metadata = parsed_doc["metadata"]

        async def _report(status: str, pct: int, msg: str):
            if status_callback:
                await status_callback(status, pct, msg)

        logger.info(f"Starting ingestion pipeline for: {filename}")

        # ── 1. Create parent document record ─────────────────────────────
        db_doc = Document(filename=filename,
                          metadata=doc_metadata, user_id=user_id)
        db.add(db_doc)
        await db.flush()

        # ── 2. Chunk the markdown ─────────────────────────────────────────
        await _report("CHUNKING", 15, "Splitting document into chunks…")
        text_chunks = self.text_splitter.split_text(raw_markdown)
        total_chunks = len(text_chunks)
        logger.info(f"Document {filename} split into {total_chunks} chunks.")

        # ── 3. Embed in batches ───────────────────────────────────────────
        await _report("EMBEDDING", 20, f"Embedding {total_chunks} chunks…")
        all_embeddings: list[list[float]] = []
        embedded_so_far = 0

        async for _start, batch_embeddings in embedding_service.generate_embeddings_in_batches(
            text_chunks, batch_size=EMBED_BATCH_SIZE
        ):
            all_embeddings.extend(batch_embeddings)
            embedded_so_far += len(batch_embeddings)
            # Scale embedding progress from 20% → 70%
            pct = 20 + int((embedded_so_far / total_chunks) * 50)
            await _report(
                "EMBEDDING",
                min(pct, 70),
                f"Embedded {embedded_so_far}/{total_chunks} chunks…",
            )

        # ── 4. Bulk insert chunks via core INSERT ────────────────────────
        await _report("STORING", 75, "Writing vectors to database…")
        rows = [
            {
                "id": uuid.uuid4(),
                "document_id": db_doc.id,
                "user_id": user_id,
                "content": content,
                "embedding": embedding,
                "chunk_index": idx,
            }
            for idx, (content, embedding) in enumerate(zip(text_chunks, all_embeddings))
        ]

        for i in range(0, len(rows), INSERT_BATCH_SIZE):
            batch = rows[i: i + INSERT_BATCH_SIZE]
            await db.execute(insert(Chunk).values(batch))
            stored = min(i + INSERT_BATCH_SIZE, len(rows))
            pct = 75 + int((stored / len(rows)) * 20)
            await _report("STORING", min(pct, 95), f"Stored {stored}/{len(rows)} vectors…")

        await db.commit()

        await _report("COMPLETED", 100, "Ingestion complete.")
        logger.info(
            f"Ingestion completed for {filename} with {total_chunks} vectors.")
        return str(db_doc.id)


ingestion_service = IngestionService()
