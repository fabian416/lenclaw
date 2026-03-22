from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.routes import router
from src.config import settings

app = FastAPI(
    title="Lenclaw WDK Service",
    description="FastAPI service for Tether WDK wallet operations + Indexer API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/wdk")


@app.get("/")
async def root():
    return {"service": "lenclaw-wdk", "version": "0.1.0"}
