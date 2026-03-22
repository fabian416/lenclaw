from mnemonic import Mnemonic
from eth_account import Account

Account.enable_unaudited_hdwallet_features()

_mnemo = Mnemonic("english")


def generate_seed_phrase() -> str:
    return _mnemo.generate(strength=128)  # 12 words


def is_valid_seed(phrase: str) -> bool:
    return _mnemo.check(phrase)


def derive_address(seed_phrase: str, index: int = 0) -> str:
    path = f"m/44'/60'/0'/0/{index}"
    acct = Account.from_mnemonic(seed_phrase, account_path=path)
    return acct.address


def derive_private_key(seed_phrase: str, index: int = 0) -> str:
    path = f"m/44'/60'/0'/0/{index}"
    acct = Account.from_mnemonic(seed_phrase, account_path=path)
    return acct.key.hex()
