"""Shared fixtures for unit tests that exercise app.services.retrieval with a
mocked async DB. Keeping the mock plumbing here lets the test modules hold just
the assertions."""
from collections import namedtuple
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# A result row as returned by `db.execute(...).all()`. get_relevant_context reads
# rows by attribute (row.id / row.content), NOT by index — so use a namedtuple,
# not a plain tuple.
Row = namedtuple("Row", ["id", "content"])


@pytest.fixture
def make_row():
    """Build a fake result row, e.g. make_row("c1", "chunk text")."""
    return Row


@pytest.fixture
def fake_session():
    """Factory that builds an object behaving like `AsyncSessionLocal()` used as
    `async with ... as db`, where `await db.execute(q)` returns a result whose
    `.all()` yields rows. The two execute() calls (vector leg, then FTS leg) are
    served from side_effect in order:

        session = fake_session([vec_row, ...], [fts_row, ...])

    Patch `app.services.retrieval.AsyncSessionLocal` with return_value=session for
    a single get_relevant_context call, or side_effect=[s1, s2, ...] for several.
    """
    def _factory(vec_rows, fts_rows):
        vec_result, fts_result = MagicMock(), MagicMock()
        vec_result.all.return_value = vec_rows
        fts_result.all.return_value = fts_rows

        db = MagicMock()
        db.execute = AsyncMock(side_effect=[vec_result, fts_result])  # leg1, then leg2

        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=db)
        cm.__aexit__ = AsyncMock(return_value=False)
        return cm

    return _factory


@pytest.fixture
def stub_query_embedding():
    """Patch the query-embedding call to a fixed 1024-dim vector for the test's
    duration. Yields the AsyncMock so a test can inspect calls if it wants."""
    mock = AsyncMock(return_value=[0.0] * 1024)
    with patch("app.services.retrieval.embedding_service.generate_query_embedding", new=mock):
        yield mock
