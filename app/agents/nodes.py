import asyncio
import logging
from pydantic import BaseModel, Field
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from google.api_core.exceptions import ServiceUnavailable, ResourceExhausted
from google.genai.errors import ServerError as GenaiServerError
from app.core.config import settings
from app.agents.state import AgentState
from app.services.retrieval import get_relevant_context, check_golden_bank
from app.services.embedding import embedding_service
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

# Cooldown (seconds) between LLM calls to spread RPM across the minute window.
# This prevents burst-firing multiple calls back-to-back which triggers 503s.
LLM_CALL_COOLDOWN = 1.5


def extract_text(content) -> str:
    """Normalize LLM .content — Gemini may return a list of content blocks
    instead of a plain string (e.g. [{"type":"text","text":"...","extras":{...}}])."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return str(content)


# llm store
def get_llm():
    if settings.USE_LOCAL_LLM:
        logger.info(f"Initializing LOCAL LLM: {settings.LOCAL_MODEL_ID}")
        # Ollama automatically runs on http://localhost:11434
        return ChatOllama(
            model=settings.LOCAL_MODEL_ID,
            temperature=0.1
        )
    else:
        logger.info("Initializing PRODUCTION LLM: Gemini")
        return ChatGoogleGenerativeAI(
            model=settings.GENERATION_MODEL_ID,
            api_key=settings.GEMINI_API_KEY,
            temperature=0.1,
            max_retries=10,
            timeout=180,
        )


# Lazy — initialized on first agent invocation, not at import time
llm = get_llm()

# pydantic schema for the verifier


class VerificationResult(BaseModel):
    is_approved: bool = Field(
        description="True if the draft accurately answers the question using ONLY the provided context.")
    feedback: str = Field(
        description="If rejected, explain exactly what is missing or hallucinated.")

# Node funtions


async def retrieve_node(state: AgentState) -> dict:
    """Retrieves relevant chunks from Postgres via pgvector, scoped to user.
    Checks Golden Bank (Layer B) first — if >90% match, short-circuits."""
    logger.info(f"Node: RETRIEVE | Question: {state['rfp_question']}")

    user_id = state.get("user_id")

    # Layer B: Check Golden Q&A Bank for semantic cache hit
    if user_id:
        try:
            q_vectors = await embedding_service.generate_embeddings([state["rfp_question"]])
            q_embedding = q_vectors[0]
            async with AsyncSessionLocal() as db:
                golden_hit = await check_golden_bank(db, user_id, q_embedding)
                if golden_hit:
                    logger.info("Golden Bank cache HIT — skipping generation")
                    return {
                        "retrieved_docs": f"[GOLDEN_CACHE_HIT]\n\nQuestion: {golden_hit.question}\nAnswer: {golden_hit.answer}",
                        "status": "GOLDEN_HIT",
                    }
        except Exception as e:
            logger.warning(
                f"Golden Bank check failed, falling back to Layer A: {e}")

    # Layer A: Standard knowledge base retrieval
    real_context = await get_relevant_context(state["rfp_question"], user_id=user_id)

    return {"retrieved_docs": real_context}


# Retry decorator for 503/429 errors — exponential backoff from 4s to 60s, up to 6 retries.
# This catches errors that slip past langchain's built-in max_retries (e.g. structured output calls).
_llm_retry = retry(
    retry=retry_if_exception_type(
        (ServiceUnavailable, ResourceExhausted, GenaiServerError)),
    wait=wait_exponential(multiplier=2, min=4, max=60),
    stop=stop_after_attempt(6),
    before_sleep=lambda rs: logger.warning(
        f"Gemini 503/429 — retry #{rs.attempt_number} in {rs.next_action.sleep:.1f}s"
    ),
    reraise=True,
)


@_llm_retry
async def _invoke_draft(chain, payload: dict):
    return await chain.ainvoke(payload)


@_llm_retry
async def _invoke_verify(chain, payload: dict):
    return await chain.ainvoke(payload)


async def draft_node(state: AgentState) -> dict:
    """Drafts the initial response based strictly on context."""
    logger.info(
        f"Node: DRAFT | draft_generated: {state.get('draft_generated', 0)}")

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a strict technical sales engineer responding to an RFP.
                Rules:
                1. Answer using ONLY the provided context. Zero outside knowledge.
                2. Be concise and direct. Use bullet points for multi-part answers.
                3. If the context is insufficient, respond: 'Insufficient Information: [specify exactly what data is missing]'
                4. If Verifier Feedback is provided, specifically address each point raised."""),
        ("user",
         "Context: {context}\n\nQuestion: {question}\n\nVerifier Feedback (if any): {feedback}")
    ])

    chain = prompt | llm
    response = await _invoke_draft(chain, {
        "context": state["retrieved_docs"],
        "question": state["rfp_question"],
        "feedback": state.get("critique_feedback", "None")
    })

    # Cooldown between LLM calls to avoid burst-firing
    await asyncio.sleep(LLM_CALL_COOLDOWN)

    # We increment the draft_generated count by returning 1 (operator.add handles the math)
    return {"draft_response": extract_text(response.content), "draft_generated": 1}


async def verify_node(state: AgentState) -> dict:
    """Critiques the draft against the original context."""
    logger.info("Node: VERIFY | Checking for hallucinations...")

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a compliance auditor for RFP responses. Your job is strict fact verification.
                APPROVED only if: every factual claim in the Draft is explicitly stated in the Source Context.
                REJECT if: the Draft adds details, percentages, product names, or claims NOT in the Source Context.
                When rejecting, your feedback must:
                          - Quote the exact hallucinated phrase from the Draft
                          - State what the context actually says instead"""),
        ("user",
         "Source Context: {context}\n\nQuestion: {question}\n\nDraft Answer: {draft}")
    ])

    # Force JSON output matching our Pydantic schema
    verifier_chain = prompt | llm.with_structured_output(VerificationResult)
    result: VerificationResult = await _invoke_verify(verifier_chain, {
        "context": state["retrieved_docs"],
        "question": state["rfp_question"],
        "draft": state["draft_response"]
    })
    status = "APPROVED" if result.is_approved else "NEEDS_REVISION"
    logger.info(f"Verification Result: {status}")

    # Cooldown between LLM calls to avoid burst-firing
    await asyncio.sleep(LLM_CALL_COOLDOWN)

    return {
        "status": status,
        "critique_feedback": result.feedback
    }


async def finalize_node(state: AgentState) -> dict:
    """Formats the final output for the API"""
    logger.info("Node: FINALIZE | Preparing final output...")

    # Golden Bank cache hit — extract the pre-approved answer
    if state.get("status") == "GOLDEN_HIT":
        # retrieved_docs contains "[GOLDEN_CACHE_HIT]\n\nQuestion: ...\nAnswer: ..."
        docs = state.get("retrieved_docs", "")
        answer = docs.split("Answer: ", 1)[-1] if "Answer: " in docs else docs
        final_payload = {
            "question": state["rfp_question"],
            "answer": answer,
            "confidence_matrix": {
                "revisions_required": 0,
                "final_status": "GOLDEN_HIT",
                "source": "Golden Q&A Bank",
            }
        }
        return {"final_output": final_payload}

    final_payload = {
        "question": state["rfp_question"],
        "answer": state.get("draft_response", ""),
        "confidence_matrix": {
            "revisions_required": state.get("draft_generated", 1) - 1,
            "final_status": state.get("status", "UNKNOWN"),
        }
    }
    return {"final_output": final_payload}
