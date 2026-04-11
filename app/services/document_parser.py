import asyncio
import logging
from pathlib import Path
import pymupdf4llm

logger = logging.getLogger(__name__)


class DocumentParserService:
    def _sync_parser(self, file_path: Path) -> dict:
        try:
            logger.info(f"Starting parsing for {file_path.name}")
            markdown_content = pymupdf4llm.to_markdown(str(file_path))
            return {
                "filename": file_path.name,
                "raw_markdown": markdown_content,
                "metadata": {
                    "source_type": "pymupdf_extraction",
                    "file_extention": file_path.suffix,
                }
            }
        except Exception as e:
            logger.error(f"Error parsing document {file_path.name}: {str(e)}")
            raise ValueError(f"Failed to parse document: {str(e)}")

    async def parse_document(self, file_path: Path) -> dict:
        """Asynchronous wrapper for document parsing to avoid blocking the event loop."""
        if not file_path.exists():
            raise FileNotFoundError(f"File {file_path} does not exist.")
        parsed_data = await asyncio.to_thread(self._sync_parser, file_path)
        return parsed_data


document_parser = DocumentParserService()
