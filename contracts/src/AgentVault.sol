// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentVault - Individual ERC-4626 vault per AI agent
/// @notice Each agent gets its own vault where backers deposit USDC and receive agent-specific shares.
///         Revenue from the agent flows back to this vault, generating yield for backers.
///         If the agent defaults, only backers of THIS vault are affected.
contract AgentVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public immutable agentId;
    address public immutable factory;

    uint256 public totalBorrowed;
    uint256 public protocolFeeBps;
    uint256 public accumulatedFees;
    uint256 public depositCap;

    // Authorized credit line contract
    address public creditLine;

    // Timestamps for APY calculation
    uint256 public createdAt;
    uint256 public totalRevenueReceived;

    // Withdrawal timelock: backers must request withdrawal, then wait
    uint256 public withdrawalDelay = 1 days;
    mapping(address => uint256) public withdrawalRequestTime;
    bool public frozen; // Vault freeze on default

    event Borrowed(address indexed borrower, uint256 amount);
    event RepaymentReceived(address indexed from, uint256 amount);
    event FeesCollected(address indexed to, uint256 amount);
    event CreditLineSet(address indexed creditLine);
    event DepositCapSet(uint256 newCap);
    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event WithdrawalRequested(address indexed owner, uint256 timestamp);
    event WithdrawalDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event VaultFrozen(bool frozen);

    error NotFactory();
    error NotCreditLine();
    error InsufficientLiquidity();
    error CreditLineAlreadySet();
    error DepositCapExceeded();
    error WithdrawalNotReady();
    error VaultIsFrozen();

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier onlyCreditLine() {
        if (msg.sender != creditLine) revert NotCreditLine();
        _;
    }

    constructor(
        IERC20 _usdc,
        uint256 _agentId,
        string memory _name,
        string memory _symbol,
        uint256 _protocolFeeBps,
        uint256 _depositCap
    ) ERC4626(_usdc) ERC20(_name, _symbol) {
        agentId = _agentId;
        factory = msg.sender;
        protocolFeeBps = _protocolFeeBps;
        depositCap = _depositCap;
        createdAt = block.timestamp;
    }

    /// @notice Set the credit line contract (can only be set once, by factory)
    function setCreditLine(address _creditLine) external onlyFactory {
        if (creditLine != address(0)) revert CreditLineAlreadySet();
        creditLine = _creditLine;
        emit CreditLineSet(_creditLine);
    }

    /// @notice Update the deposit cap (only factory/protocol owner)
    function setDepositCap(uint256 _cap) external onlyFactory {
        depositCap = _cap;
        emit DepositCapSet(_cap);
    }

    /// @notice Update protocol fee (only factory/protocol owner)
    function setProtocolFeeBps(uint256 _feeBps) external onlyFactory {
        require(_feeBps <= 3000, "AgentVault: fee too high");
        uint256 oldFee = protocolFeeBps;
        protocolFeeBps = _feeBps;
        emit ProtocolFeeUpdated(oldFee, _feeBps);
    }

    /// @notice Update withdrawal delay (only factory)
    function setWithdrawalDelay(uint256 _delay) external onlyFactory {
        require(_delay <= 7 days, "AgentVault: delay too long");
        uint256 oldDelay = withdrawalDelay;
        withdrawalDelay = _delay;
        emit WithdrawalDelayUpdated(oldDelay, _delay);
    }

    /// @notice Freeze/unfreeze the vault (only factory, used on default)
    function setFrozen(bool _frozen) external onlyFactory {
        frozen = _frozen;
        emit VaultFrozen(_frozen);
    }

    /// @notice Request a withdrawal. Must wait `withdrawalDelay` before executing.
    function requestWithdrawal() external {
        withdrawalRequestTime[msg.sender] = block.timestamp;
        emit WithdrawalRequested(msg.sender, block.timestamp);
    }

    /// @notice Borrow USDC from the vault (called by AgentCreditLine)
    function borrow(address to, uint256 amount) external onlyCreditLine nonReentrant {
        if (amount > availableLiquidity()) revert InsufficientLiquidity();
        totalBorrowed += amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit Borrowed(to, amount);
    }

    /// @notice Receive repayment into the vault (anyone can repay)
    /// @dev M7: The full repayment amount reduces totalBorrowed (capped at totalBorrowed).
    ///      The protocol fee is accumulated separately from the repayment accounting.
    ///      This means the fee is effectively taken from the vault's assets (reducing backer yield),
    ///      not deducted from the principal reduction. This is intentional: the fee is a protocol
    ///      revenue share on all incoming repayments, and the principal tracking reflects the
    ///      actual debt reduction. Interest is tracked off-chain by AgentCreditLine, not here.
    function receiveRepayment(uint256 amount) external nonReentrant {
        // Checks-Effects: update state before external call
        uint256 fee = (amount * protocolFeeBps) / 10000;
        accumulatedFees += fee;
        totalRevenueReceived += amount;

        if (amount <= totalBorrowed) {
            totalBorrowed -= amount;
        } else {
            totalBorrowed = 0;
        }

        // Interactions: external call (safeTransferFrom) after state updates
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        emit RepaymentReceived(msg.sender, amount);
    }

    /// @notice Collect accumulated protocol fees (only factory owner)
    function collectFees(address to) external onlyFactory nonReentrant {
        uint256 fees = accumulatedFees;
        require(fees > 0, "AgentVault: no fees");
        accumulatedFees = 0;
        IERC20(asset()).safeTransfer(to, fees);
        emit FeesCollected(to, fees);
    }

    /// @notice Available liquidity (USDC balance minus reserved fees)
    function availableLiquidity() public view returns (uint256) {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        return balance > accumulatedFees ? balance - accumulatedFees : 0;
    }

    /// @notice Utilization rate in basis points
    function utilizationRate() external view returns (uint256) {
        uint256 total = totalAssets();
        if (total == 0) return 0;
        return (totalBorrowed * 10000) / total;
    }

    /// @notice Total assets = USDC balance + outstanding borrows - reserved fees
    /// @dev Returns 0 if accumulatedFees exceeds balance + totalBorrowed to prevent underflow
    function totalAssets() public view override returns (uint256) {
        uint256 gross = IERC20(asset()).balanceOf(address(this)) + totalBorrowed;
        return gross > accumulatedFees ? gross - accumulatedFees : 0;
    }

    /// @notice Number of unique backers (approximated by non-zero share holders isn't trackable,
    ///         so we just return totalSupply > 0 as a signal; factory tracks backer count)
    function totalBacked() external view returns (uint256) {
        return totalAssets();
    }

    /// @dev Override deposit to enforce deposit cap
    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
        if (depositCap > 0 && totalAssets() + assets > depositCap) revert DepositCapExceeded();
        return super.deposit(assets, receiver);
    }

    /// @dev Override mint to enforce deposit cap
    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        uint256 assets = previewMint(shares);
        if (depositCap > 0 && totalAssets() + assets > depositCap) revert DepositCapExceeded();
        return super.mint(shares, receiver);
    }

    /// @dev Override withdraw: reentrancy + timelock + freeze check
    function withdraw(uint256 assets, address receiver, address _owner) public override nonReentrant returns (uint256) {
        if (frozen) revert VaultIsFrozen();
        _checkWithdrawalReady(_owner);
        return super.withdraw(assets, receiver, _owner);
    }

    /// @dev Override redeem: reentrancy + timelock + freeze check
    function redeem(uint256 shares, address receiver, address _owner) public override nonReentrant returns (uint256) {
        if (frozen) revert VaultIsFrozen();
        _checkWithdrawalReady(_owner);
        return super.redeem(shares, receiver, _owner);
    }

    /// @dev Verify the owner has requested withdrawal and waited the delay
    function _checkWithdrawalReady(address _owner) internal view {
        if (withdrawalDelay == 0) return; // No delay configured
        uint256 requestTime = withdrawalRequestTime[_owner];
        if (requestTime == 0 || block.timestamp < requestTime + withdrawalDelay) {
            revert WithdrawalNotReady();
        }
    }
}
