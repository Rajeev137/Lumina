import pytest
from unittest.mock import MagicMock
from app.db.models import Chunk
from sqlalchemy import select
from app.services.retrieval import _apply_tenant_scope

def test_scope_applied_when_user_has_a_document():
    latest_doc = MagicMock(id="D1")
    q = select(Chunk.id, Chunk.content)
    scoped = _apply_tenant_scope(q, user_id="U1", latest_doc=latest_doc)
    sql = str(scoped.compile(compile_kwargs={"literal,_binds": True}))
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