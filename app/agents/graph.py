from langgraph.graph import StateGraph, END
from app.agents.nodes import retrieve_node, draft_node, verify_node, finalize_node
from app.agents.state import AgentState

# router logic


def route_after_retrieve(state: AgentState) -> str:
    """If Golden Bank cache hit, skip draft/verify and go to finalize."""
    if state.get("status") == "GOLDEN_HIT":
        return "finalize"
    return "draft"


def route_verification(state: AgentState) -> str:
    """Determines where to go after the Verify node."""
    status = state.get("status")
    draft_count = state.get("draft_generated", 0)
    max_draft = 3

    if status == "APPROVED":
        return "finalize"

    if status == "NEEDS_REVISION" and draft_count < max_draft:
        return "draft"

    # if we hit the loop limit, force to finalise
    # (the frontend will show the Failed status in the confidence matrix)
    return "finalize"


# graph contruction
workflow = StateGraph(AgentState)

workflow.add_node("retrieve", retrieve_node)
workflow.add_node("draft", draft_node)
workflow.add_node("verify", verify_node)
workflow.add_node("finalize", finalize_node)

# define edges (the flow)
workflow.set_entry_point("retrieve")

# Conditional: cache hit → finalize, otherwise → draft → verify loop
workflow.add_conditional_edges(
    "retrieve", route_after_retrieve,
    {
        "draft": "draft",
        "finalize": "finalize",
    }
)
workflow.add_edge("draft", "verify")

# conditional routing based on verification result
workflow.add_conditional_edges(
    "verify", route_verification,
    {
        "draft": "draft",  # loop back to fix it
        "finalize": "finalize"  # move to the end
    }
)

workflow.add_edge("finalize", END)

# compile
lumina_agent = workflow.compile()
