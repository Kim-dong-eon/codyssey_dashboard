import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
def normalize_database_url(url: str) -> str:
    # Marketplace Postgres URLs commonly omit the SQLAlchemy driver name.
    if url.startswith('postgres://'):
        return 'postgresql+psycopg://' + url[len('postgres://'):]
    if url.startswith('postgresql://'):
        return 'postgresql+psycopg://' + url[len('postgresql://'):]
    return url


default_db_path = Path(__file__).resolve().parents[1] / 'codyssey.db'
configured_url = os.getenv('DATABASE_URL')
on_vercel = os.getenv('VERCEL', '').lower() in {'1', 'true', 'yes', 'on'}
if on_vercel and not configured_url:
    raise RuntimeError('DATABASE_URL must be configured for Vercel')
SQLALCHEMY_DATABASE_URL = normalize_database_url(configured_url) if configured_url else f'sqlite:///{default_db_path.as_posix()}'

connect_args = {'check_same_thread': False} if SQLALCHEMY_DATABASE_URL.startswith('sqlite') else {}
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    **({'poolclass': NullPool} if on_vercel else {}),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
