from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from backend.app.config import settings

DATABASE_URL = f"sqlite:///{settings.database_path}"

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

# Enable WAL mode for SQLite to support concurrent operations
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

def run_migrations():
    try:
        inspector = inspect(engine)
        if "profiles" in inspector.get_table_names():
            columns = [col["name"] for col in inspector.get_columns("profiles")]
            if "enabled" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE profiles ADD COLUMN enabled BOOLEAN DEFAULT 1"))
                print("Database migration: Added 'enabled' column to 'profiles' table.")
            if "scale_width" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE profiles ADD COLUMN scale_width INTEGER"))
                print("Database migration: Added 'scale_width' column to 'profiles' table.")
            if "scale_height" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE profiles ADD COLUMN scale_height INTEGER"))
                print("Database migration: Added 'scale_height' column to 'profiles' table.")
    except Exception as e:
        print(f"Migration error: {e}")

run_migrations()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
