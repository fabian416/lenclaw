from celery import Celery
from src.config import settings

celery_app = Celery(
    "wdk_tasks",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@celery_app.task(bind=True, max_retries=3)
def monitor_agent_revenue(self, agent_id: int, lockbox_address: str, seed_phrase: str):
    """Background task: check agent wallet for USDC and route to lockbox"""
    import asyncio
    from src.wallet import derive_address
    from src.indexer import get_balances

    address = derive_address(seed_phrase)
    balances = asyncio.run(get_balances(address))

    usdc = int(balances.get("usdcBalance", "0"))
    if usdc > 1_000_000:  # > 1 USDC
        # TODO: trigger revenue routing transaction
        return {"agent_id": agent_id, "address": address, "usdc_detected": usdc, "action": "route_to_lockbox"}

    return {"agent_id": agent_id, "address": address, "usdc_detected": usdc, "action": "none"}


@celery_app.task
def check_agent_health(agent_id: int):
    """Background task: check agent credit status"""
    return {"agent_id": agent_id, "status": "healthy"}
