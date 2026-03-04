// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRevenueLockbox} from "./interfaces/IRevenueLockbox.sol";

/// @title RevenueLockbox - Immutable revenue capture contract for AI agents
/// @notice One deployed per agent. Captures all incoming revenue and splits between
///         debt repayment to the vault and remainder to the agent.
///         IMMUTABLE once deployed - the agent's code is mutable but this contract is NOT.
contract RevenueLockbox is IRevenueLockbox {
    using SafeERC20 for IERC20;

    address public immutable agent;
    address public immutable vault;
    uint256 public immutable agentId;
    IERC20 public immutable usdc;

    uint256 public repaymentRateBps; // e.g. 5000 = 50% of revenue goes to repayment
    uint256 public totalRevenueCapture;
    uint256 public totalRepaid;

    address public creditLine; // AgentCreditLine contract address, set once

    modifier onlyVaultOrOwner() {
        require(msg.sender == vault, "RevenueLockbox: not vault");
        _;
    }

    constructor(address _agent, address _vault, uint256 _agentId, address _usdc, uint256 _repaymentRateBps) {
        require(_agent != address(0), "RevenueLockbox: zero agent");
        require(_vault != address(0), "RevenueLockbox: zero vault");
        require(_usdc != address(0), "RevenueLockbox: zero usdc");
        require(_repaymentRateBps <= 10000, "RevenueLockbox: rate too high");

        agent = _agent;
        vault = _vault;
        agentId = _agentId;
        usdc = IERC20(_usdc);
        repaymentRateBps = _repaymentRateBps;
    }

    function setCreditLine(address _creditLine) external onlyVaultOrOwner {
        require(creditLine == address(0), "RevenueLockbox: credit line already set");
        creditLine = _creditLine;
    }

    /// @notice Process all USDC revenue sitting in this contract.
    ///         Splits between repayment to vault and remainder to agent.
    function processRevenue() external {
        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "RevenueLockbox: no revenue");

        totalRevenueCapture += balance;

        uint256 repaymentAmount = (balance * repaymentRateBps) / 10000;
        uint256 agentAmount = balance - repaymentAmount;

        if (repaymentAmount > 0) {
            totalRepaid += repaymentAmount;
            usdc.safeTransfer(vault, repaymentAmount);
        }

        if (agentAmount > 0) {
            usdc.safeTransfer(agent, agentAmount);
        }

        emit RevenueProcessed(repaymentAmount, agentAmount);
    }

    function pendingRepayment() external view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        return (balance * repaymentRateBps) / 10000;
    }

    /// @notice Accept ETH (converted off-chain or via DEX before processing)
    receive() external payable {
        emit RevenueReceived(address(0), msg.value);
    }

    fallback() external payable {
        emit RevenueReceived(address(0), msg.value);
    }
}
