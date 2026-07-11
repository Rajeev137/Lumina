from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select

from app.db.models import Chunk
from app.services.retrieval import _apply_tenant_scope, get_relevant_context

# Fixtures make_row / fake_session / stub_query_embedding come from
# tests/unit/conftest.py.


def test_scope_applied_when_user_has_a_document():
    latest_doc = MagicMock(id="D1")
    q = select(Chunk.id, Chunk.content)
    scoped = _apply_tenant_scope(q, user_id="U1", latest_doc=latest_doc)
    sql = str(scoped)  # renders WHERE with bound-param placeholders; column names still appear
    assert "user_id" in sql
    assert "document_id" in sql

def test_scope_not_applied_when_user_has_no_documents():
    q = select(Chunk.id, Chunk.content)
    scoped = _apply_tenant_scope(q, user_id="U1", latest_doc=None)
    assert scoped is q  # unchanged — deliberate fallback, not a leak

def test_scope_not_applied_when_no_user_id():
    q = select(Chunk.id, Chunk.content)
    scoped = _apply_tenant_scope(q, user_id=None, latest_doc=MagicMock(id="D1"))
    assert scoped is q


async def test_different_users_get_different_contexts(stub_query_embedding, fake_session, make_row):
    doc_d1, doc_d2 = MagicMock(id="D1"), MagicMock(id="D2")

    u1_vec, u1_fts = [make_row("c1", "U1 alpha chunk")], [make_row("c2", "U1 beta chunk")]
    u2_vec, u2_fts = [make_row("c3", "U2 gamma chunk")], [make_row("c4", "U2 delta chunk")]

    async def latest_for(db, user_id):
        return {"U1": doc_d1, "U2": doc_d2}[user_id]

    with patch("app.services.retrieval.get_latest_document_for_user",
               new=AsyncMock(side_effect=latest_for)), \
         patch("app.services.retrieval.AsyncSessionLocal",
               side_effect=[fake_session(u1_vec, u1_fts),      
                            fake_session(u2_vec, u2_fts)]):
        ctx_u1 = await get_relevant_context("q", user_id="U1")
        ctx_u2 = await get_relevant_context("q", user_id="U2")

    assert ctx_u1 != ctx_u2
    assert "U1 alpha chunk" in ctx_u1 and "U1 beta chunk" in ctx_u1
    assert "U2" not in ctx_u1                       # no leak of U2's content into U1
    assert "U2 gamma chunk" in ctx_u2 and "U2 delta chunk" in ctx_u2
    assert "U1" not in ctx_u2                        # ...and none the other way


async def test_empty_both_legs_returns_no_context_message(stub_query_embedding, fake_session):
    with patch("app.services.retrieval.get_latest_document_for_user",
               new=AsyncMock(return_value=MagicMock(id="D1"))), \
         patch("app.services.retrieval.AsyncSessionLocal",
               return_value=fake_session([], [])):
        ctx = await get_relevant_context("q", user_id="U1")

    assert ctx == "No relevant context found."  # RRF `if not scores:` branch
