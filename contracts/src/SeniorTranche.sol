// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SeniorTranche - Senior tranche ERC-4626 vault (80% of pool)
/// @notice Priority repayment tranche. Lower risk, lower yield.
///         Depositors receive sUSDC shares. Protected by junior tranche buffer.
contract SeniorTranche is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    uint256 public targetAllocationBps = 8000; // 80% of total pool
    uint256 public totalDeposited;
    uint256 public totalInterestEarned;

    address public vault; // Reference to main LenclawVault

    event InterestDistributed(uint256 amount);

    constructor(IERC20 _usdc, address _vault, address _owner)
        ERC4626(_usdc)
        ERC20("Lenclaw Senior USDC", "sUSDC")
        Ownable(_owner)
    {
        vault = _vault;
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    /// @notice Distribute interest to the senior tranche
    function distributeInterest(uint256 amount) external {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        totalInterestEarned += amount;
        emit InterestDistributed(amount);
    }

    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        totalDeposited += assets;
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        if (assets > totalDeposited) {
            totalDeposited = 0;
        } else {
            totalDeposited -= assets;
        }
        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}
