import hashlib
import random

import asyncpg
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.models import Base

TEST_DB_URL = make_url(settings.DATABASE_URL).set(database="lumina_db_test")


async def _ensure_test_database_exists():
    # docker-compose's postgres container only creates POSTGRES_DB at boot —
    # lumina_db_test won't exist yet, so create it via the admin 'postgres' db.
    # str(url) masks the password as "***" by default — render_as_string with
    # hide_password=False is required to get a DSN asyncpg can actually auth with.
    admin_dsn = TEST_DB_URL.set(database="postgres").render_as_string(
        hide_password=False
    ).replace("postgresql+asyncpg", "postgresql")
    conn = await asyncpg.connect(admin_dsn)
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname=$1", TEST_DB_URL.database
        )
        if not exists:
            await conn.execute(f'CREATE DATABASE "{TEST_DB_URL.database}"')
    finally:
        await conn.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    await _ensure_test_database_exists()

    # NullPool: a session-scoped engine's pooled connections can outlive the
    # per-test event loop pytest-asyncio creates, which corrupts asyncpg
    # connections ("another operation is in progress"). NullPool opens a fresh
    # physical connection per checkout instead of reusing one across loops.
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        # Same as app/main.py's startup: pgvector's `vector` type must exist
        # before create_all, or Chunk/GoldenAnswer table creation fails.
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    # Function-scoped (default) so every test gets its own session and the
    # rollback below actually runs between tests, not just once at the end
    # of the whole suite.
    Session = async_sessionmaker(bind=test_engine, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.rollback()


def deterministic_fake_vector(text_: str) -> list[float]:
    """Same input text -> same fake vector (reproducible assertions), different
    text -> a different point in the fake space (so relative-distance math like
    RRF/cosine still makes sense). Unit-normalized to mirror the real bge model's
    normalize_embeddings=True output."""
    seed = int(hashlib.sha256(text_.encode()).hexdigest(), 16) % (2**32)
    rng = random.Random(seed)
    vec = [rng.uniform(-1.0, 1.0) for _ in range(1024)]
    norm = sum(v * v for v in vec) ** 0.5
    return [v / norm for v in vec]


@pytest.fixture
def fake_embedding_service(monkeypatch):
    """Replace ALL THREE embedding methods with deterministic fakes so no test
    loads the real 1.3GB bge model. Must cover generate_embeddings,
    generate_query_embedding, AND generate_embeddings_in_batches — missing any
    one lets that code path silently fall through to the real model."""

    async def fake_generate(texts):
        return [deterministic_fake_vector(t) for t in texts]

    async def fake_generate_query(query):
        return deterministic_fake_vector(query)

    async def fake_generate_in_batches(texts, batch_size=100):
        for start in range(0, len(texts), batch_size):
            batch = texts[start: start + batch_size]
            yield start, [deterministic_fake_vector(t) for t in batch]

    monkeypatch.setattr(
        "app.services.embedding.embedding_service.generate_embeddings",
        fake_generate,
    )
    monkeypatch.setattr(
        "app.services.embedding.embedding_service.generate_query_embedding",
        fake_generate_query,
    )
    monkeypatch.setattr(
        "app.services.embedding.embedding_service.generate_embeddings_in_batches",
        fake_generate_in_batches,
    )
