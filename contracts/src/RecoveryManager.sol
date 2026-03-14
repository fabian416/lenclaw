// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DutchAuction} from "./DutchAuction.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IAgentVaultFactory} from "./interfaces/IAgentVaultFactory.sol";
import {IAgentVault} from "./interfaces/IAgentVault.sol";
import {IAgentCreditLine} from "./interfaces/IAgentCreditLine.sol";

/// @title RecoveryManager - Coordinates full recovery process for defaulted positions
/// @notice Receives auction proceeds from DutchAuction, distributes to vault,
///         tracks recovery rates, and updates agent reputation.
///         Losses are distributed proportionally to all vault depositors via
///         reduced share value.
contract RecoveryManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RecoveryStatus {
        NONE,
        AUCTION_ACTIVE,
        RECOVERED,
        PARTIAL_RECOVERY,
        WRITE_OFF
    }

    struct RecoveryRecord {
        uint256 agentId;
        uint256 debtAmount;          // Original outstanding debt
        uint256 recoveredAmount;     // Amount actually recovered from auction
        uint256 lossAmount;          // Unrecovered debt (debtAmount - recoveredAmount)
        uint256 auctionId;           // Associated DutchAuction ID
        uint256 startedAt;           // When recovery was initiated
        uint256 completedAt;         // When recovery was finalized
        RecoveryStatus status;
    }

    IERC20 public immutable asset;
    DutchAuction public immutable dutchAuction;
    IAgentRegistry public immutable registry;

    IAgentVaultFactory public vaultFactory;
    address public creditLine;
    address public keeper;

    /// @notice Recovery records: recoveryId => RecoveryRecord
    mapping(uint256 => RecoveryRecord) public recoveries;
    uint256 public nextRecoveryId = 1;

    /// @notice Agent to active recovery mapping
    mapping(uint256 => uint256) public activeRecoveryByAgent;

    /// @notice Aggregate statistics
    uint256 public totalDebtProcessed;
    uint256 public totalAmountRecovered;
    uint256 public totalLosses;

    /// @notice Accumulated sub-MIN_DEPOSIT recovery amounts per agent, awaiting flush
    mapping(uint256 => uint256) public pendingRecovery;

    /// @notice Reputation penalty for default (how much to slash on default)
    uint256 public defaultReputationPenalty = 200; // Subtract from 0-1000 score

    // -- Events --

    event RecoveryStarted(
        uint256 indexed recoveryId,
        uint256 indexed agentId,
        uint256 debtAmount,
        uint256 auctionId
    );
    event RecoveryCompleted(
        uint256 indexed recoveryId,
        uint256 indexed agentId,
        uint256 recoveredAmount,
        uint256 lossAmount,
        RecoveryStatus status
    );
    event LossDistributed(
        uint256 indexed recoveryId,
        uint256 lossAmount
    );
    event ProceedsDistributed(
        uint256 indexed recoveryId,
        uint256 toVault
    );
    event ReputationSlashed(uint256 indexed agentId, uint256 newScore);
    event WriteOff(uint256 indexed recoveryId, uint256 indexed agentId, uint256 lossAmount);
    event VaultOperationFailed(string operation, uint256 indexed agentId);
    event BuyerSharesMinted(uint256 indexed recoveryId, address indexed buyer, uint256 assets, uint256 shares);
    event RecoveryPending(uint256 indexed agentId, uint256 amount, uint256 totalPending);
    event PendingRecoveryFlushed(uint256 indexed agentId, uint256 amount, uint256 shares);

    // -- Constructor --

    constructor(
        address _asset,
        address _dutchAuction,
        address _registry,
        address _vaultFactory,
        address _owner
    ) Ownable(_owner) {
        require(_asset != address(0), "RecoveryManager: zero asset");
        require(_dutchAuction != address(0), "RecoveryManager: zero auction");
        require(_registry != address(0), "RecoveryManager: zero registry");
        require(_vaultFactory != address(0), "RecoveryManager: zero vaultFactory");

        asset = IERC20(_asset);
        dutchAuction = DutchAuction(_dutchAuction);
        registry = IAgentRegistry(_registry);
        vaultFactory = IAgentVaultFactory(_vaultFactory);
    }

    // -- Admin --

    function setCreditLine(address _creditLine) external onlyOwner {
        require(_creditLine != address(0), "RecoveryManager: zero address");
        creditLine = _creditLine;
    }

    function setKeeper(address _keeper) external onlyOwner {
        require(_keeper != address(0), "RecoveryManager: zero address");
        keeper = _keeper;
    }

    function setVaultFactory(address _vaultFactory) external onlyOwner {
        require(_vaultFactory != address(0), "RecoveryManager: zero address");
        vaultFactory = IAgentVaultFactory(_vaultFactory);
    }

    function setDefaultReputationPenalty(uint256 _penalty) external onlyOwner {
        require(_penalty <= 1000, "RecoveryManager: penalty too high");
        defaultReputationPenalty = _penalty;
    }

    // -- Recovery Lifecycle --

    /// @notice Start the recovery process for a defaulted agent.
    ///         Creates a Dutch auction and records the recovery.
    ///         Called by the LiquidationKeeper.
    /// @param agentId    The defaulted agent's ID
    /// @param debtAmount Total outstanding debt
    function startRecovery(uint256 agentId, uint256 debtAmount) external {
        require(
            msg.sender == keeper || msg.sender == owner(),
            "RecoveryManager: not authorized"
        );
        require(debtAmount > 0, "RecoveryManager: zero debt");
        require(
            activeRecoveryByAgent[agentId] == 0,
            "RecoveryManager: recovery already active"
        );

        // Create Dutch auction for the defaulted position
        uint256 auctionId = dutchAuction.createAuction(agentId, debtAmount);

        // Record recovery
        uint256 recoveryId = nextRecoveryId++;
        recoveries[recoveryId] = RecoveryRecord({
            agentId: agentId,
            debtAmount: debtAmount,
            recoveredAmount: 0,
            lossAmount: 0,
            auctionId: auctionId,
            startedAt: block.timestamp,
            completedAt: 0,
            status: RecoveryStatus.AUCTION_ACTIVE
        });

        activeRecoveryByAgent[agentId] = recoveryId;
        totalDebtProcessed += debtAmount;

        // Freeze vault to prevent bank run during recovery
        (bool freezeSuccess, ) = address(vaultFactory).call(abi.encodeWithSignature("freezeVault(uint256,bool)", agentId, true));
        // Continue even if freeze fails — recovery is more important
        if (!freezeSuccess) emit VaultOperationFailed("freezeVault", agentId);

        // Slash agent reputation
        _slashReputation(agentId);

        emit RecoveryStarted(recoveryId, agentId, debtAmount, auctionId);
    }

    /// @notice Finalize recovery after auction settles or expires.
    ///         Distributes proceeds to the vault and records losses.
    ///         When a buyer exists, the recovered USDC is deposited into the vault
    ///         ON BEHALF of the auction buyer, minting them ERC-4626 vault shares.
    ///         The buyer effectively purchases discounted exposure to the vault.
    ///         Losses are absorbed proportionally by all vault depositors
    ///         (reflected as reduced share value in the ERC-4626 vault).
    /// @param recoveryId The recovery record to finalize
    function finalizeRecovery(uint256 recoveryId) external nonReentrant {
        require(
            msg.sender == keeper || msg.sender == owner(),
            "RecoveryManager: not authorized"
        );

        RecoveryRecord storage recovery = recoveries[recoveryId];
        require(
            recovery.status == RecoveryStatus.AUCTION_ACTIVE,
            "RecoveryManager: not active"
        );

        // 1. Get auction details: settled price AND buyer address
        DutchAuction.Auction memory auction = dutchAuction.getAuction(recovery.auctionId);

        // Auction must be settled or expired
        require(
            auction.status == DutchAuction.AuctionStatus.SETTLED
                || auction.status == DutchAuction.AuctionStatus.EXPIRED,
            "RecoveryManager: auction still active"
        );

        uint256 recoveredAmount = 0;
        address buyer = address(0);
        if (auction.status == DutchAuction.AuctionStatus.SETTLED) {
            recoveredAmount = auction.settledPrice;
            buyer = auction.buyer;
        }

        recovery.recoveredAmount = recoveredAmount;
        recovery.completedAt = block.timestamp;

        // Look up the agent-specific vault
        address agentVault = vaultFactory.getVault(recovery.agentId);
        require(agentVault != address(0), "RecoveryManager: no vault for agent");

        // 2. Unfreeze vault FIRST so deposit works (frozen vaults revert on deposit)
        {
            (bool _ok, ) = address(vaultFactory).call(abi.encodeWithSignature("freezeVault(uint256,bool)", recovery.agentId, false));
            if (!_ok) emit VaultOperationFailed("unfreezeVault", recovery.agentId);
        }

        // 3. Deposit recovered USDC into vault on behalf of the auction buyer (mints shares)
        if (recoveredAmount > 0) {
            totalAmountRecovered += recoveredAmount;

            if (buyer != address(0)) {
                // Check vault's MIN_DEPOSIT threshold
                uint256 minDeposit = IAgentVault(agentVault).MIN_DEPOSIT();
                if (recoveredAmount >= minDeposit) {
                    // Approve vault to pull USDC from RecoveryManager
                    asset.approve(agentVault, recoveredAmount);
                    // Deposit on behalf of buyer — mints vault shares to buyer
                    uint256 sharesMinted = IAgentVault(agentVault).deposit(recoveredAmount, buyer);
                    emit BuyerSharesMinted(recoveryId, buyer, recoveredAmount, sharesMinted);
                } else {
                    // Amount below MIN_DEPOSIT — accumulate in pending until threshold is met
                    pendingRecovery[recovery.agentId] += recoveredAmount;
                    emit RecoveryPending(recovery.agentId, recoveredAmount, pendingRecovery[recovery.agentId]);
                }
            } else {
                // No buyer (shouldn't happen for SETTLED, but defensive)
                // Route through deposit to maintain ERC-4626 accounting
                uint256 minDeposit = IAgentVault(agentVault).MIN_DEPOSIT();
                if (recoveredAmount >= minDeposit) {
                    asset.approve(agentVault, recoveredAmount);
                    IAgentVault(agentVault).deposit(recoveredAmount, address(this));
                } else {
                    pendingRecovery[recovery.agentId] += recoveredAmount;
                    emit RecoveryPending(recovery.agentId, recoveredAmount, pendingRecovery[recovery.agentId]);
                }
            }

            emit ProceedsDistributed(recoveryId, recoveredAmount);
        }

        // 4. Calculate losses
        if (recoveredAmount >= recovery.debtAmount) {
            // Full recovery (possibly at a premium)
            recovery.lossAmount = 0;
            recovery.status = RecoveryStatus.RECOVERED;
        } else {
            // Partial recovery or complete write-off
            recovery.lossAmount = recovery.debtAmount - recoveredAmount;
            totalLosses += recovery.lossAmount;

            // Loss is proportionally distributed to all depositors via
            // reduced totalAssets in the vault (the unrecovered debt
            // reduces the vault's totalBorrowed without a corresponding
            // repayment, lowering the share price for everyone equally).
            emit LossDistributed(recoveryId, recovery.lossAmount);

            recovery.status = recoveredAmount > 0
                ? RecoveryStatus.PARTIAL_RECOVERY
                : RecoveryStatus.WRITE_OFF;
        }

        // 5. Write down the FULL debt on the credit line so principal/accruedInterest
        //    are zeroed out after recovery (whether full, partial, or write-off)
        if (creditLine != address(0)) {
            IAgentCreditLine(creditLine).writeDown(recovery.agentId, recovery.debtAmount);
        }

        // 6. Write down full debt on vault's totalBorrowed (debt is forgiven regardless of recovery %)
        //    The vault balance already has the recovered USDC, so totalAssets adjusts correctly:
        //    totalAssets = (balance + recoveredAmount) + (totalBorrowed - debtAmount) - fees
        {
            (bool wdSuccess, ) = address(vaultFactory).call(
                abi.encodeWithSignature("writeDownVaultLoss(uint256,uint256)", recovery.agentId, recovery.debtAmount)
            );
            // Continue even if write-down fails
            if (!wdSuccess) emit VaultOperationFailed("writeDownVaultLoss", recovery.agentId);
        }

        // Clear active recovery
        activeRecoveryByAgent[recovery.agentId] = 0;

        emit RecoveryCompleted(
            recoveryId,
            recovery.agentId,
            recoveredAmount,
            recovery.lossAmount,
            recovery.status
        );

        if (recovery.status == RecoveryStatus.WRITE_OFF) {
            emit WriteOff(recoveryId, recovery.agentId, recovery.lossAmount);
        }

        // Note: vault was already unfrozen in step 2
    }

    /// @notice Flush accumulated pending recovery funds into the agent's vault.
    ///         Callable once the pending amount meets the vault's MIN_DEPOSIT threshold.
    /// @param agentId The agent whose pending funds should be deposited
    function flushPendingRecovery(uint256 agentId) external nonReentrant {
        uint256 pending = pendingRecovery[agentId];
        require(pending > 0, "RecoveryManager: nothing pending");

        address agentVault = vaultFactory.getVault(agentId);
        require(agentVault != address(0), "RecoveryManager: no vault for agent");

        uint256 minDeposit = IAgentVault(agentVault).MIN_DEPOSIT();
        require(pending >= minDeposit, "RecoveryManager: below MIN_DEPOSIT");

        pendingRecovery[agentId] = 0;

        asset.approve(agentVault, pending);
        uint256 shares = IAgentVault(agentVault).deposit(pending, address(this));

        emit PendingRecoveryFlushed(agentId, pending, shares);
    }

    // -- Internal --

    /// @dev Slash the agent's reputation on default
    function _slashReputation(uint256 agentId) internal {
        try registry.getAgent(agentId) returns (IAgentRegistry.AgentProfile memory profile) {
            uint256 currentScore = profile.reputationScore;
            uint256 newScore;
            if (currentScore > defaultReputationPenalty) {
                newScore = currentScore - defaultReputationPenalty;
            } else {
                newScore = 0;
            }

            try registry.updateReputation(agentId, newScore) {
                emit ReputationSlashed(agentId, newScore);
            } catch {
                // Reputation update failed; continue with recovery
            }
        } catch {
            // Agent lookup failed; continue with recovery
        }
    }

    // -- View Functions --

    /// @notice Get the recovery record for a given ID
    function getRecovery(uint256 recoveryId) external view returns (RecoveryRecord memory) {
        return recoveries[recoveryId];
    }

    /// @notice Get the active recovery for an agent (0 if none)
    function getActiveRecovery(uint256 agentId) external view returns (uint256) {
        return activeRecoveryByAgent[agentId];
    }

    /// @notice Calculate the overall recovery rate in basis points
    /// @return rateBps Recovery rate (0-10000)
    function overallRecoveryRate() external view returns (uint256 rateBps) {
        if (totalDebtProcessed == 0) return 0;
        rateBps = (totalAmountRecovered * 10000) / totalDebtProcessed;
    }

    /// @notice Calculate the recovery rate for a specific recovery
    /// @param recoveryId The recovery to check
    /// @return rateBps Recovery rate (0-10000)
    function recoveryRate(uint256 recoveryId) external view returns (uint256 rateBps) {
        RecoveryRecord memory r = recoveries[recoveryId];
        if (r.debtAmount == 0) return 0;
        rateBps = (r.recoveredAmount * 10000) / r.debtAmount;
    }
}
