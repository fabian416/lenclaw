// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title AgentVault - Individual ERC-4626 vault per AI agent
/// @notice Each agent gets its own vault where backers deposit USDC and receive agent-specific shares.
///         Revenue from the agent flows back to this vault, generating yield for backers.
///         If the agent defaults, only backers of THIS vault are affected.
contract AgentVault is ERC4626 {
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

    event Borrowed(address indexed borrower, uint256 amount);
    event RepaymentReceived(address indexed from, uint256 amount);
    event FeesCollected(address indexed to, uint256 amount);
    event CreditLineSet(address indexed creditLine);
    event DepositCapSet(uint256 newCap);

    error NotFactory();
    error NotCreditLine();
    error InsufficientLiquidity();
    error CreditLineAlreadySet();
    error DepositCapExceeded();

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
        protocolFeeBps = _feeBps;
    }

    /// @notice Borrow USDC from the vault (called by AgentCreditLine)
    function borrow(address to, uint256 amount) external onlyCreditLine {
        if (amount > availableLiquidity()) revert InsufficientLiquidity();
        totalBorrowed += amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit Borrowed(to, amount);
    }

    /// @notice Receive repayment into the vault (anyone can repay)
    function receiveRepayment(uint256 amount) external {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        uint256 fee = (amount * protocolFeeBps) / 10000;
        accumulatedFees += fee;
        totalRevenueReceived += amount;

        if (amount <= totalBorrowed) {
            totalBorrowed -= amount;
        } else {
            totalBorrowed = 0;
        }

        emit RepaymentReceived(msg.sender, amount);
    }

    /// @notice Collect accumulated protocol fees (only factory owner)
    function collectFees(address to) external onlyFactory {
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
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + totalBorrowed - accumulatedFees;
    }

    /// @notice Number of unique backers (approximated by non-zero share holders isn't trackable,
    ///         so we just return totalSupply > 0 as a signal; factory tracks backer count)
    function totalBacked() external view returns (uint256) {
        return totalAssets();
    }

    /// @dev Override deposit to enforce deposit cap
    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        if (depositCap > 0 && totalAssets() + assets > depositCap) revert DepositCapExceeded();
        return super.deposit(assets, receiver);
    }

    /// @dev Override mint to enforce deposit cap
    function mint(uint256 shares, address receiver) public override returns (uint256) {
        uint256 assets = previewMint(shares);
        if (depositCap > 0 && totalAssets() + assets > depositCap) revert DepositCapExceeded();
        return super.mint(shares, receiver);
    }
}
