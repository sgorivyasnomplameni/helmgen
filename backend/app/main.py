from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import audit, auth, charts

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(charts.router, prefix="/api/charts", tags=["charts"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])


@app.get("/health")
async def health():
    return {"status": "ok"}
