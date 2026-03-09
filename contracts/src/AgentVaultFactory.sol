// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentVault} from "./AgentVault.sol";
import {RevenueLockbox} from "./RevenueLockbox.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title AgentVaultFactory - Deploys individual AgentVault + RevenueLockbox per AI agent
/// @notice Factory pattern: when an agent registers, this deploys both an ERC-4626 vault
///         and a RevenueLockbox atomically. No agent can exist with a vault but no lockbox.
contract AgentVaultFactory is Ownable {
    IERC20 public immutable usdc;
    IAgentRegistry public immutable registry;

    uint256 public defaultProtocolFeeBps = 1000; // 10% of interest
    uint256 public defaultDepositCap = 500_000e6; // 500K USDC default cap
    uint256 public defaultRepaymentRateBps = 5000; // 50% of revenue to repayment

    /// @notice AgentCreditLine address, set on lockboxes at deployment
    address public creditLine;

    /// @notice Treasury address for protocol fee collection
    address public treasury;

    /// @notice RecoveryManager address for loss write-downs
    address public recoveryManager;

    // agentId => AgentVault address
    mapping(uint256 => address) public vaults;

    // agentId => RevenueLockbox address
    mapping(uint256 => address) public lockboxes;

    // All deployed vaults for enumeration
    address[] public allVaults;

    event VaultCreated(uint256 indexed agentId, address indexed vault, address indexed agentWallet);
    event LockboxCreated(uint256 indexed agentId, address indexed lockbox, address indexed vault);
    event DefaultProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event DefaultDepositCapUpdated(uint256 oldCap, uint256 newCap);
    event DefaultRepaymentRateUpdated(uint256 oldRate, uint256 newRate);
    event CreditLineUpdated(address indexed creditLine);
    event TreasuryUpdated(address indexed treasury);
    event RecoveryManagerUpdated(address indexed recoveryManager);

    error VaultAlreadyExists(uint256 agentId);
    error AgentNotRegistered(uint256 agentId);
    error VaultNotFound(uint256 agentId);

    constructor(address _usdc, address _registry, address _owner) Ownable(_owner) {
        require(_usdc != address(0), "AgentVaultFactory: zero usdc");
        require(_registry != address(0), "AgentVaultFactory: zero registry");
        usdc = IERC20(_usdc);
        registry = IAgentRegistry(_registry);
    }

    /// @notice Set the credit line address (used for new lockbox deployments)
    function setCreditLine(address _creditLine) external onlyOwner {
        creditLine = _creditLine;
        emit CreditLineUpdated(_creditLine);
    }

    /// @notice Deploy a new AgentVault + RevenueLockbox for a registered agent
    /// @param agentId The agent's ERC-721 ID from AgentRegistry
    /// @return vault The deployed AgentVault address
    function createVault(uint256 agentId) external returns (address vault) {
        if (!registry.isRegistered(agentId)) revert AgentNotRegistered(agentId);
        if (vaults[agentId] != address(0)) revert VaultAlreadyExists(agentId);

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);

        // Generate unique name/symbol per agent
        string memory name = string.concat("Lenclaw Agent ", _uint2str(agentId), " USDC");
        string memory symbol = string.concat("lcA", _uint2str(agentId), "USDC");

        // Deploy vault
        AgentVault newVault = new AgentVault(
            usdc,
            agentId,
            name,
            symbol,
            defaultProtocolFeeBps,
            defaultDepositCap
        );

        vault = address(newVault);
        vaults[agentId] = vault;
        allVaults.push(vault);

        // Set credit line on vault if available
        if (creditLine != address(0)) {
            newVault.setCreditLine(creditLine);
        }

        emit VaultCreated(agentId, vault, profile.wallet);

        // Deploy lockbox atomically with vault
        RevenueLockbox newLockbox = new RevenueLockbox(
            profile.wallet,
            vault,
            agentId,
            address(usdc),
            defaultRepaymentRateBps,
            creditLine // Pass credit line so lockbox routes repayments correctly
        );

        lockboxes[agentId] = address(newLockbox);

        // Wire the lockbox on the vault so only lockbox + creditLine can call receiveRepayment
        newVault.setLockbox(address(newLockbox));

        emit LockboxCreated(agentId, address(newLockbox), vault);
    }

    /// @notice Set credit line for an agent's vault
    function setVaultCreditLine(uint256 agentId, address _creditLine) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setCreditLine(_creditLine);
    }

    /// @notice Update deposit cap for a specific agent's vault
    function setVaultDepositCap(uint256 agentId, uint256 cap) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setDepositCap(cap);
    }

    /// @notice Update protocol fee for a specific agent's vault
    function setVaultProtocolFee(uint256 agentId, uint256 feeBps) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setProtocolFeeBps(feeBps);
    }

    /// @notice Collect fees from a specific agent's vault to a specific address
    function collectVaultFees(uint256 agentId, address to) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).collectFees(to);
    }

    /// @notice Collect fees from a specific agent's vault to the treasury
    function collectVaultFees(uint256 agentId) external onlyOwner {
        require(treasury != address(0), "AgentVaultFactory: treasury not set");
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).collectFees(treasury);
    }

    /// @notice Set the treasury address for protocol fee collection
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Set the recovery manager address
    function setRecoveryManager(address _recoveryManager) external onlyOwner {
        recoveryManager = _recoveryManager;
        emit RecoveryManagerUpdated(_recoveryManager);
    }

    /// @notice Freeze or unfreeze an agent's vault (called by creditLine or owner)
    function freezeVault(uint256 agentId, bool _frozen) external {
        require(msg.sender == creditLine || msg.sender == owner(), "not authorized");
        address vault = vaults[agentId];
        require(vault != address(0), "no vault");
        AgentVault(vault).setFrozen(_frozen);
    }

    /// @notice Write down unrecoverable loss on an agent's vault
    function writeDownVaultLoss(uint256 agentId, uint256 lossAmount) external {
        require(msg.sender == owner() || msg.sender == recoveryManager, "not authorized");
        AgentVault(vaults[agentId]).writeDownLoss(lossAmount);
    }

    /// @notice Update the default protocol fee for new vaults
    function setDefaultProtocolFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 3000, "AgentVaultFactory: fee too high");
        uint256 oldFee = defaultProtocolFeeBps;
        defaultProtocolFeeBps = _feeBps;
        emit DefaultProtocolFeeUpdated(oldFee, _feeBps);
    }

    /// @notice Update the default deposit cap for new vaults
    function setDefaultDepositCap(uint256 _cap) external onlyOwner {
        uint256 oldCap = defaultDepositCap;
        defaultDepositCap = _cap;
        emit DefaultDepositCapUpdated(oldCap, _cap);
    }

    /// @notice Update the default repayment rate for new lockboxes
    function setDefaultRepaymentRateBps(uint256 _rateBps) external onlyOwner {
        require(_rateBps >= 1000 && _rateBps <= 10000, "AgentVaultFactory: invalid rate");
        uint256 oldRate = defaultRepaymentRateBps;
        defaultRepaymentRateBps = _rateBps;
        emit DefaultRepaymentRateUpdated(oldRate, _rateBps);
    }

    /// @notice Get total number of deployed vaults
    function totalVaults() external view returns (uint256) {
        return allVaults.length;
    }

    /// @notice Get vault address for an agent
    function getVault(uint256 agentId) external view returns (address) {
        return vaults[agentId];
    }

    /// @notice Get lockbox address for an agent
    function getLockbox(uint256 agentId) external view returns (address) {
        return lockboxes[agentId];
    }

    /// @dev Convert uint to string for vault naming
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
