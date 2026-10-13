from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "postgresql+psycopg://postgres:password@127.0.0.1:5432/kanban_board"

engine = create_engine(
    DATABASE_URL,
    connect_args={"connect_timeout": 5}  # Aborts after 5s instead of 130s
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()