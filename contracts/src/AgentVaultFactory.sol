// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentVault} from "./AgentVault.sol";
import {AgentSmartWallet} from "./AgentSmartWallet.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {VaultDeployer} from "./deployers/VaultDeployer.sol";
import {LockboxDeployer} from "./deployers/LockboxDeployer.sol";
import {WalletDeployer} from "./deployers/WalletDeployer.sol";

/// @title AgentVaultFactory - Deploys individual AgentVault + RevenueLockbox + SmartWallet per AI agent
/// @notice Factory pattern: when an agent registers, this deploys an ERC-4626 vault,
///         a RevenueLockbox, and a MANDATORY SmartWallet atomically.
///         Supports multiple assets (USDC, WETH, USDT) via an allowlist.
contract AgentVaultFactory is Ownable {
    IAgentRegistry public immutable registry;

    /// @notice Whitelist of allowed vault assets
    mapping(address => bool) public allowedAssets;

    uint256 public defaultProtocolFeeBps = 1000; // 10% of interest
    uint256 public defaultDepositCap = 500_000e6; // 500K default cap
    uint256 public defaultRepaymentRateBps = 5000; // 50% of revenue to repayment
    uint256 public defaultMaxRevenuePerProcess = 100_000e6; // 100K cap per processRevenue()

    /// @notice AgentCreditLine address, set on lockboxes and smart wallets at deployment
    address public creditLine;

    /// @notice Treasury address for protocol fee collection
    address public treasury;

    /// @notice RecoveryManager address for loss write-downs
    address public recoveryManager;

    // agentId => AgentVault address
    mapping(uint256 => address) public vaults;

    // agentId => RevenueLockbox address
    mapping(uint256 => address) public lockboxes;

    // agentId => AgentSmartWallet address (mandatory)
    mapping(uint256 => address) public smartWallets;

    // agentId => asset address used by this agent's vault
    mapping(uint256 => address) public agentAssets;

    // All deployed vaults for enumeration
    address[] public allVaults;

    event VaultCreated(uint256 indexed agentId, address indexed vault, address indexed asset);
    event LockboxCreated(uint256 indexed agentId, address indexed lockbox, address indexed vault);
    event SmartWalletCreated(uint256 indexed agentId, address indexed smartWallet, address indexed operator);
    event DefaultProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event DefaultDepositCapUpdated(uint256 oldCap, uint256 newCap);
    event DefaultRepaymentRateUpdated(uint256 oldRate, uint256 newRate);
    event DefaultMaxRevenuePerProcessUpdated(uint256 oldMax, uint256 newMax);
    event CreditLineUpdated(address indexed creditLine);
    event TreasuryUpdated(address indexed treasury);
    event RecoveryManagerUpdated(address indexed recoveryManager);
    event AllowedAssetUpdated(address indexed asset, bool allowed);

    error VaultAlreadyExists(uint256 agentId);
    error AgentNotRegistered(uint256 agentId);
    error VaultNotFound(uint256 agentId);
    error AssetNotAllowed(address asset);

    constructor(address _registry, address _owner) Ownable(_owner) {
        require(_registry != address(0), "AgentVaultFactory: zero registry");
        registry = IAgentRegistry(_registry);
    }

    // ─── Asset whitelist ────────────────────────────────────────────────

    function setAllowedAsset(address _asset, bool _allowed) external onlyOwner {
        require(_asset != address(0), "AgentVaultFactory: zero asset");
        allowedAssets[_asset] = _allowed;
        emit AllowedAssetUpdated(_asset, _allowed);
    }

    // ─── Credit line / Treasury / Recovery ──────────────────────────────

    function setCreditLine(address _creditLine) external onlyOwner {
        creditLine = _creditLine;
        emit CreditLineUpdated(_creditLine);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setRecoveryManager(address _recoveryManager) external onlyOwner {
        recoveryManager = _recoveryManager;
        emit RecoveryManagerUpdated(_recoveryManager);
    }

    // ─── Core: atomic Vault + Lockbox + SmartWallet deployment ──────────

    /// @notice Deploy a new AgentVault + RevenueLockbox + SmartWallet for a registered agent
    /// @param agentId The agent's ERC-721 ID from AgentRegistry
    /// @param asset The ERC-20 token for this vault (must be in allowedAssets)
    /// @return vault The deployed AgentVault address
    /// @dev Only callable by registry (during registerAgent) or owner
    function createVault(uint256 agentId, address asset) external returns (address vault) {
        require(
            msg.sender == address(registry) || msg.sender == owner(),
            "AgentVaultFactory: not authorized"
        );
        if (!registry.isRegistered(agentId)) revert AgentNotRegistered(agentId);
        if (vaults[agentId] != address(0)) revert VaultAlreadyExists(agentId);
        if (!allowedAssets[asset]) revert AssetNotAllowed(asset);

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);

        // Generate unique name/symbol per agent
        string memory name = string.concat("Lenclaw Agent ", _uint2str(agentId), " Vault");
        string memory symbol = string.concat("lcA", _uint2str(agentId));

        // ── 1. Deploy AgentVault (via library to reduce factory bytecode) ──
        vault = VaultDeployer.deploy(
            IERC20(asset), agentId, name, symbol, defaultProtocolFeeBps, defaultDepositCap
        );

        vaults[agentId] = vault;
        agentAssets[agentId] = asset;
        allVaults.push(vault);

        if (creditLine != address(0)) {
            AgentVault(vault).setCreditLine(creditLine);
        }

        emit VaultCreated(agentId, vault, asset);

        // ── 2. Deploy RevenueLockbox (via library) ──
        address newLockbox = LockboxDeployer.deploy(
            profile.wallet, vault, agentId, asset, defaultRepaymentRateBps, creditLine, defaultMaxRevenuePerProcess
        );

        lockboxes[agentId] = newLockbox;
        AgentVault(vault).setLockbox(newLockbox);

        emit LockboxCreated(agentId, newLockbox, vault);

        // ── 3. Deploy SmartWallet (MANDATORY, via library) ──
        address newSmartWallet = WalletDeployer.deploy(
            profile.wallet, address(this), newLockbox, asset, agentId, defaultRepaymentRateBps
        );

        smartWallets[agentId] = newSmartWallet;

        // Whitelist creditLine as allowed target so agent can call drawdown via SmartWallet
        if (creditLine != address(0)) {
            AgentSmartWallet(payable(newSmartWallet)).setAllowedTarget(creditLine, true);
        }

        // Update registry: set SmartWallet as agent's public address for revenue
        registry.setSmartWallet(agentId, newSmartWallet);

        emit SmartWalletCreated(agentId, newSmartWallet, profile.wallet);
    }

    // ─── Vault admin ────────────────────────────────────────────────────

    function setVaultCreditLine(uint256 agentId, address _creditLine) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setCreditLine(_creditLine);
    }

    function setVaultDepositCap(uint256 agentId, uint256 cap) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setDepositCap(cap);
    }

    function setVaultProtocolFee(uint256 agentId, uint256 feeBps) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setProtocolFeeBps(feeBps);
    }

    function collectVaultFees(uint256 agentId, address to) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).collectFees(to);
    }

    function collectVaultFeesToTreasury(uint256 agentId) external onlyOwner {
        require(treasury != address(0), "AgentVaultFactory: treasury not set");
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).collectFees(treasury);
    }

    function freezeVault(uint256 agentId, bool _frozen) external {
        require(msg.sender == creditLine || msg.sender == recoveryManager || msg.sender == owner(), "not authorized");
        address vault = vaults[agentId];
        require(vault != address(0), "no vault");
        AgentVault(vault).setFrozen(_frozen);
    }

    function writeDownVaultLoss(uint256 agentId, uint256 lossAmount) external {
        require(msg.sender == owner() || msg.sender == recoveryManager, "not authorized");
        AgentVault(vaults[agentId]).writeDownLoss(lossAmount);
    }

    // ─── SmartWallet admin ──────────────────────────────────────────────

    /// @notice Set allowed target on an agent's SmartWallet
    function setSmartWalletTarget(uint256 agentId, address target, bool allowed) external onlyOwner {
        address sw = smartWallets[agentId];
        require(sw != address(0), "no smart wallet");
        AgentSmartWallet(payable(sw)).setAllowedTarget(target, allowed);
    }

    /// @notice Update repayment rate on an agent's SmartWallet
    function setSmartWalletRepaymentRate(uint256 agentId, uint256 rateBps) external onlyOwner {
        address sw = smartWallets[agentId];
        require(sw != address(0), "no smart wallet");
        AgentSmartWallet(payable(sw)).setRepaymentRate(rateBps);
    }

    // ─── Default parameter setters ──────────────────────────────────────

    function setDefaultProtocolFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 3000, "AgentVaultFactory: fee too high");
        uint256 oldFee = defaultProtocolFeeBps;
        defaultProtocolFeeBps = _feeBps;
        emit DefaultProtocolFeeUpdated(oldFee, _feeBps);
    }

    function setDefaultDepositCap(uint256 _cap) external onlyOwner {
        uint256 oldCap = defaultDepositCap;
        defaultDepositCap = _cap;
        emit DefaultDepositCapUpdated(oldCap, _cap);
    }

    function setDefaultRepaymentRateBps(uint256 _rateBps) external onlyOwner {
        require(_rateBps >= 1000 && _rateBps <= 10000, "AgentVaultFactory: invalid rate");
        uint256 oldRate = defaultRepaymentRateBps;
        defaultRepaymentRateBps = _rateBps;
        emit DefaultRepaymentRateUpdated(oldRate, _rateBps);
    }

    function setDefaultMaxRevenuePerProcess(uint256 _max) external onlyOwner {
        uint256 oldMax = defaultMaxRevenuePerProcess;
        defaultMaxRevenuePerProcess = _max;
        emit DefaultMaxRevenuePerProcessUpdated(oldMax, _max);
    }

    // ─── View functions ─────────────────────────────────────────────────

    function totalVaults() external view returns (uint256) {
        return allVaults.length;
    }

    function getVault(uint256 agentId) external view returns (address) {
        return vaults[agentId];
    }

    function getLockbox(uint256 agentId) external view returns (address) {
        return lockboxes[agentId];
    }

    function getSmartWallet(uint256 agentId) external view returns (address) {
        return smartWallets[agentId];
    }

    /// @notice Check if an address is a SmartWallet deployed by this factory
    function isSmartWallet(address addr) external view returns (bool) {
        if (addr == address(0)) return false;
        try AgentSmartWallet(payable(addr)).agentId() returns (uint256 aid) {
            return smartWallets[aid] == addr;
        } catch {
            return false;
        }
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
