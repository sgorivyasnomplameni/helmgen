from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "HelmGen"
    debug: bool = False

    database_url: str

    cors_origins: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
