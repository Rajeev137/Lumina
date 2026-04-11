from typing import TypedDict, Annotated, List
import operator

# The state dictionary that passes through our LangGraph nodes


class AgentState(TypedDict):
    rfp_question: str
    user_id: str             # Tenant isolation — scopes retrieval
    document_ids: List[str]  # Which docs to restrict the search to
    retrieved_docs: str      # The actual text chunks pulled from Postgres
    draft_response: str
    critique_feedback: str
    draft_generated: Annotated[int, operator.add]  # Auto-increments safely
    status: str              # DRAFTING, NEEDS_REVISION, APPROVED, FAILED
    final_output: dict
