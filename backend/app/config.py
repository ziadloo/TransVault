import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App Settings
    app_name: str = "TransVault"
    debug: bool = False
    
    # Paths
    library_dir: str = os.getenv("LIBRARY_DIR", "/library")
    vault_dir: str = os.getenv("VAULT_DIR", "/vault")
    work_dir: str = os.getenv("WORK_DIR", "/workdir")
    database_path: str = os.getenv("DATABASE_PATH", "/config/transvault.db")
    
    # Port / Host
    host: str = "0.0.0.0"
    port: int = 8080

    class Config:
        env_file = ".env"

settings = Settings()

# Ensure critical directories exist
for directory in [settings.library_dir, settings.vault_dir, settings.work_dir, os.path.dirname(settings.database_path)]:
    if directory and not os.path.exists(directory):
        try:
            os.makedirs(directory, exist_ok=True)
        except Exception as e:
            print(f"Warning: Could not create directory {directory}: {e}")
