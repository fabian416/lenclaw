from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    wdk_indexer_api_key: str = ""
    wdk_indexer_base_url: str = "https://wdk-api.tether.io"
    base_rpc_url: str = "https://mainnet.base.org"
    chain_id: int = 8453
    usdc_address: str = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    redis_url: str = "redis://localhost:6379/1"
    port: int = 3002

    model_config = {"env_file": ".env"}


settings = Settings()
