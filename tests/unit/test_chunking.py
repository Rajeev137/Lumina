import pytest
from app.services.ingestion import IngestionService

def test_short_doc_produces_single_chunk():
    svr = IngestionService()
    short_doc = "This is a short doc"
    chunks_short = svr.text_splitter.split_text(short_doc)
    assert len(chunks_short) == 1

def test_long_doc_produces_multiple_chunks():
    svr = IngestionService()
    long_doc = "This is a long doc. " * 1000  # ~14000 char
    chunks_long = svr.text_splitter.split_text(long_doc)
    assert len(chunks_long) > 1
    for c in chunks_long[:-1]: # all but last chunk
        assert len(c) <= 1000+150 # chunk_size _ chunk_overlap

def test_empty_string_input():
    svr = IngestionService()
    assert svr.text_splitter.split_text("") == []

def test_chunk_overlap():
    svr = IngestionService()
    test_text = "A"*900 + "Marker" + "B"*300 #1151 chars with a marker at overlapping point
    chunks = svr.text_splitter.split_text(test_text)
    assert any("Marker" in c for c in chunks)

#Note this is not codebase test but library of markdownsplitter test in case it breaks means library is not working as expected
def test_markdown_table_is_not_split_mid_row():
    svr = IngestionService()
    header = "| Name | Role | Location | Notes |\n"
    sep    = "|------|------|----------|-------|\n"
    rows = "".join(
        f"| Person{i} | Engineer | City{i} | Some note about person {i} here |\n"
        for i in range(30)
    )
    table = "# Team Roster\n\n" + header + sep + rows
    chunks = svr.text_splitter.split_text(table)
    # Ensure that the table is not split mid-row
    for chunk in chunks:
        for line in chunk.splitlines():
            if line.startswith("|"):
                assert line.endswith("|")  

