import pytest
from app.services.retrieval import check_golden_bank
from unittest.mock import AsyncMock, MagicMock

def make_mock_db(distance: float | None, golden_answer = None):
    mock_db = AsyncMock()
    mock_result = MagicMock()
    if distance is None:
        mock_result.first.return_value = None
    else: 
        row = MagicMock()
        row.distance = distance
        row.GoldenAnswer = golden_answer or MagicMock(question="q", answer="a")
        mock_result.first.return_value = row
    mock_db.execute.return_value = mock_result
    return mock_db

async def test_cache_hit_below_threshold():
    db = make_mock_db(distance=0.05) #95% similar should hit
    result = await check_golden_bank(db, user_id="u1", question_embedding=[0.1]*1024, threshold=0.10)
    assert result is not None
async def test_cache_miss_above_threshold():
    db = make_mock_db(distance=0.2) #80% similar should miss
    result = await check_golden_bank(db, user_id="u1", question_embedding=[0.1]*1024, threshold=0.10)
    assert result is None
async def test_cache_miss_equal_to_threshold():
    db = make_mock_db(distance=0.10) #95% similar should hit
    result = await check_golden_bank(db, user_id="u1", question_embedding=[0.1]*1024, threshold=0.10)
    assert result is None
async def test_cache_miss_no_rows_at_all():
    db = make_mock_db(distance=None) #db is new 
    result = await check_golden_bank(db, user_id="u1", question_embedding=[0.1]*1024, threshold=0.10)
    assert result is None


