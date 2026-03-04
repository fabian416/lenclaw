// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title JuniorTranche - Junior tranche ERC-4626 vault (20% of pool)
/// @notice First loss absorption. Higher risk, higher yield.
///         Depositors receive jUSDC shares. Includes cooldown on withdrawal.
contract JuniorTranche is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    uint256 public targetAllocationBps = 2000; // 20% of total pool
    uint256 public cooldownPeriod = 7 days;
    uint256 public totalDeposited;
    uint256 public totalInterestEarned;
    uint256 public totalLossesAbsorbed;

    address public vault;

    // Withdrawal cooldown tracking
    mapping(address => uint256) public withdrawalRequestTime;
    mapping(address => uint256) public withdrawalRequestAmount;

    event WithdrawalRequested(address indexed user, uint256 shares, uint256 availableAt);
    event LossAbsorbed(uint256 amount);
    event InterestDistributed(uint256 amount);

    constructor(IERC20 _usdc, address _vault, address _owner)
        ERC4626(_usdc)
        ERC20("Lenclaw Junior USDC", "jUSDC")
        Ownable(_owner)
    {
        vault = _vault;
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    function setCooldownPeriod(uint256 _period) external onlyOwner {
        cooldownPeriod = _period;
    }

    /// @notice Request withdrawal (starts cooldown)
    function requestWithdrawal(uint256 shares) external {
        require(balanceOf(msg.sender) >= shares, "JuniorTranche: insufficient shares");
        withdrawalRequestTime[msg.sender] = block.timestamp;
        withdrawalRequestAmount[msg.sender] = shares;
        emit WithdrawalRequested(msg.sender, shares, block.timestamp + cooldownPeriod);
    }

    /// @notice Distribute interest to the junior tranche (residual after senior)
    function distributeInterest(uint256 amount) external {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        totalInterestEarned += amount;
        emit InterestDistributed(amount);
    }

    /// @notice Absorb a loss (reduces junior tranche assets)
    function absorbLoss(uint256 amount) external {
        require(msg.sender == vault || msg.sender == owner(), "JuniorTranche: not authorized");
        totalLossesAbsorbed += amount;
        // The loss is reflected in reduced totalAssets, which lowers share price
        emit LossAbsorbed(amount);
    }

    function totalAssets() public view override returns (uint256) {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        return balance;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        totalDeposited += assets;
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        // Enforce cooldown
        require(
            withdrawalRequestTime[owner_] > 0
                && block.timestamp >= withdrawalRequestTime[owner_] + cooldownPeriod,
            "JuniorTranche: cooldown not met"
        );
        require(withdrawalRequestAmount[owner_] >= shares, "JuniorTranche: exceeds requested amount");

        withdrawalRequestAmount[owner_] -= shares;
        if (withdrawalRequestAmount[owner_] == 0) {
            withdrawalRequestTime[owner_] = 0;
        }

        if (assets > totalDeposited) {
            totalDeposited = 0;
        } else {
            totalDeposited -= assets;
        }

        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}
