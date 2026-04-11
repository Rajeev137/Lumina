import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.core.config import settings

logger = logging.getLogger(__name__)

#Production configuration for connection pooling
engine = create_async_engine(
    settings.DATABASE_URL,
    echo = False,
    pool_pre_ping = True,
    pool_size=10,
    max_overflow = 20,
    connect_args={"timeout": 10},  # fail fast if Postgres is unreachable
)

AsyncSessionLocal = async_sessionmaker(
    bind = engine,
    class_ = AsyncSession,
    expire_on_commit = False,
    autoflush= False, 
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()