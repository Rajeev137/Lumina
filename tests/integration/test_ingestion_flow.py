import uuid

from sqlalchemy import select

from app.db.models import Chunk, Document, User
from app.services.ingestion import ingestion_service


async def _make_user(db_session) -> uuid.UUID:
    # Chunk.user_id / Document.user_id are FKs to users.id — a real Postgres FK
    # constraint needs a real row to point at.
    user = User(email=f"{uuid.uuid4()}@test.local", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    return user.id


async def test_full_ingestion_pipeline_stores_correct_chunk_count(db_session, fake_embedding_service):
    user_id = await _make_user(db_session)
    raw_markdown = "# Title\n\n" + ("content " * 2000)
    parsed_doc = {
        "filename": "test.pdf",
        "raw_markdown": raw_markdown,
        "metadata": {"source_type": "test"},
    }

    doc_id = await ingestion_service.ingest_document(db_session, parsed_doc, user_id=user_id)

    expected_chunks = ingestion_service.text_splitter.split_text(raw_markdown)

    doc = await db_session.get(Document, uuid.UUID(doc_id))
    assert doc is not None
    assert doc.filename == "test.pdf"

    rows = (
        await db_session.execute(select(Chunk).where(Chunk.document_id == uuid.UUID(doc_id)))
    ).scalars().all()

    assert len(rows) == len(expected_chunks)
    for chunk in rows:
        assert chunk.user_id == user_id  # tenant isolation, integration-level
        assert chunk.embedding is not None
        assert len(chunk.embedding) == 1024


async def test_ingestion_progress_callback_reaches_completed(db_session, fake_embedding_service):
    user_id = await _make_user(db_session)
    statuses = []

    async def track(status, pct, msg):
        statuses.append(status)

    parsed_doc = {
        "filename": "test.pdf",
        "raw_markdown": "# Title\n\n" + ("content " * 2000),
        "metadata": {"source_type": "test"},
    }

    await ingestion_service.ingest_document(
        db_session, parsed_doc, status_callback=track, user_id=user_id
    )

    assert statuses[-1] == "COMPLETED"
