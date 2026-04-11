from app.api.endpoints import rfp, knowledge, auth, rlhf
from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

# Wire all app loggers to the same output as uvicorn
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Create DB tables (creates documents + chunks if they don't exist)
    from app.db.session import engine
    from app.db.models import Base
    async with engine.begin() as conn:
        # Enable pgvector extension first, then create all tables
        await conn.execute(__import__('sqlalchemy').text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified/created.")

    yield


app = FastAPI(
    lifespan=lifespan,
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Agentic RFP Response Automator"
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(rfp.router, prefix="/api/v1/rfp", tags=["RFP Automation"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge",
                   tags=["Knowledge Management"])
app.include_router(rlhf.router, prefix="/api/v1/rlhf", tags=["RLHF Feedback"])

# CORS — driven by CORS_ORIGINS env var (set to your Vercel URL in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    if settings.USE_LOCAL_LLM:
        generation_model = f"{settings.LOCAL_MODEL_ID} (local - Ollama)"
    else:
        generation_model = f"{settings.GENERATION_MODEL_ID} (Gemini API)"
    return {
        "status": "healthy",
        "generation_model": generation_model,
        "embedding_model": settings.EMBEDDING_MODEL_ID,
    }
