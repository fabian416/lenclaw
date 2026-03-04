// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title LenclawVault - Core lending pool for AI agent credit
/// @notice ERC-4626 vault where depositors deposit USDC and receive lcUSDC shares.
///         The pool lends to AI agents via AgentCreditLine contracts.
contract LenclawVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public totalBorrowed;
    uint256 public protocolFeeBps = 1000; // 10% of interest
    uint256 public accumulatedFees;

    // Authorized credit line contracts
    mapping(address => bool) public authorizedBorrowers;

    event BorrowerAuthorized(address indexed borrower, bool authorized);
    event Borrowed(address indexed borrower, uint256 amount);
    event RepaymentReceived(address indexed from, uint256 amount);
    event FeesCollected(address indexed to, uint256 amount);

    modifier onlyAuthorizedBorrower() {
        require(authorizedBorrowers[msg.sender], "LenclawVault: not authorized");
        _;
    }

    constructor(IERC20 _usdc, address _owner)
        ERC4626(_usdc)
        ERC20("Lenclaw USDC", "lcUSDC")
        Ownable(_owner)
    {}

    function authorizeBorrower(address borrower, bool authorized) external onlyOwner {
        authorizedBorrowers[borrower] = authorized;
        emit BorrowerAuthorized(borrower, authorized);
    }

    function setProtocolFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 3000, "LenclawVault: fee too high");
        protocolFeeBps = _feeBps;
    }

    /// @notice Borrow USDC from the vault (called by AgentCreditLine)
    function borrow(address to, uint256 amount) external onlyAuthorizedBorrower {
        require(amount <= availableLiquidity(), "LenclawVault: insufficient liquidity");
        totalBorrowed += amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit Borrowed(to, amount);
    }

    /// @notice Receive repayment into the vault
    function receiveRepayment(uint256 amount) external {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        uint256 fee = (amount * protocolFeeBps) / 10000;
        accumulatedFees += fee;

        if (amount <= totalBorrowed) {
            totalBorrowed -= amount;
        } else {
            totalBorrowed = 0;
        }

        emit RepaymentReceived(msg.sender, amount);
    }

    /// @notice Collect accumulated protocol fees
    function collectFees(address to) external onlyOwner {
        uint256 fees = accumulatedFees;
        require(fees > 0, "LenclawVault: no fees");
        accumulatedFees = 0;
        IERC20(asset()).safeTransfer(to, fees);
        emit FeesCollected(to, fees);
    }

    /// @notice Available liquidity (deposited - borrowed)
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

    /// @notice Total assets = balance + outstanding borrows
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + totalBorrowed - accumulatedFees;
    }
}
