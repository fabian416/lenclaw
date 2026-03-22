# Lenclaw WDK Service

FastAPI + Celery backend for Tether WDK wallet operations.

## Setup
```bash
python -m venv .venv && source .venv/bin/activate
pip install -e "."
cp .env.example .env  # fill in WDK_INDEXER_API_KEY
```

## Run
```bash
uvicorn src.main:app --port 3002 --reload
```

## Celery Worker
```bash
celery -A src.tasks worker --loglevel=info
```
