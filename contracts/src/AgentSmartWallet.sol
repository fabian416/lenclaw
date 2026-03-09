// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentSmartWallet - Revenue-routing smart wallet for AI agents
/// @notice Agents opt into this wallet to get higher credit lines.
///         All USDC revenue is auto-split before any outgoing operation.
contract AgentSmartWallet is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable owner; // Agent operator
    address public immutable protocol; // Factory that deployed this
    address public immutable lockbox; // Revenue lockbox
    IERC20 public immutable asset;
    uint256 public immutable agentId;
    uint256 public repaymentRateBps; // e.g., 5000 = 50%

    mapping(address => bool) public allowedTargets;
    uint256 public totalRouted; // Track total USDC routed to lockbox

    event RevenueRouted(uint256 toLockbox, uint256 remaining);
    event Executed(address indexed target, uint256 value, bool success);
    event AllowedTargetSet(address indexed target, bool allowed);
    event RepaymentRateUpdated(uint256 oldRate, uint256 newRate);

    error NotOwner();
    error NotProtocol();
    error TargetNotAllowed();
    error ExecutionFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProtocol() {
        if (msg.sender != protocol) revert NotProtocol();
        _;
    }

    constructor(
        address _owner,
        address _protocol,
        address _lockbox,
        address _asset,
        uint256 _agentId,
        uint256 _repaymentRateBps
    ) {
        require(_owner != address(0) && _lockbox != address(0) && _asset != address(0), "zero address");
        require(_repaymentRateBps <= 10000, "rate too high");
        owner = _owner;
        protocol = _protocol;
        lockbox = _lockbox;
        asset = IERC20(_asset);
        agentId = _agentId;
        repaymentRateBps = _repaymentRateBps;
    }

    /// @notice Execute a call to an allowed target. Auto-routes revenue first.
    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        nonReentrant
        returns (bytes memory)
    {
        if (!allowedTargets[target]) revert TargetNotAllowed();
        _routePendingRevenue();
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed();
        emit Executed(target, value, success);
        return result;
    }

    /// @notice Batch execute multiple calls. Auto-routes revenue once before all calls.
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas)
        external
        onlyOwner
        nonReentrant
        returns (bytes[] memory results)
    {
        require(targets.length == values.length && values.length == datas.length, "length mismatch");
        _routePendingRevenue();
        results = new bytes[](targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            if (!allowedTargets[targets[i]]) revert TargetNotAllowed();
            (bool success, bytes memory result) = targets[i].call{value: values[i]}(datas[i]);
            if (!success) revert ExecutionFailed();
            results[i] = result;
            emit Executed(targets[i], values[i], success);
        }
    }

    /// @notice Manually route pending revenue (callable by anyone)
    function routeRevenue() external nonReentrant {
        _routePendingRevenue();
    }

    /// @notice Internal: split USDC balance between lockbox and wallet
    function _routePendingRevenue() internal {
        uint256 balance = asset.balanceOf(address(this));
        if (balance == 0) return;
        uint256 toLockbox = (balance * repaymentRateBps) / 10000;
        if (toLockbox > 0) {
            totalRouted += toLockbox;
            asset.safeTransfer(lockbox, toLockbox);
        }
        emit RevenueRouted(toLockbox, balance - toLockbox);
    }

    // --- Protocol admin ---

    function setAllowedTarget(address target, bool allowed) external onlyProtocol {
        // Prevent adding the asset token as an allowed target — operator could drain funds
        // bypassing revenue split via execute(asset, 0, transfer(operator, balance))
        require(target != address(asset), "SmartWallet: cannot allow asset token");
        require(target != address(this), "SmartWallet: cannot allow self");
        require(target != lockbox, "SmartWallet: cannot allow lockbox");
        allowedTargets[target] = allowed;
        emit AllowedTargetSet(target, allowed);
    }

    function setRepaymentRate(uint256 newRate) external onlyProtocol {
        require(newRate <= 10000, "rate too high");
        uint256 oldRate = repaymentRateBps;
        repaymentRateBps = newRate;
        emit RepaymentRateUpdated(oldRate, newRate);
    }

    /// @notice View: pending revenue that would be routed
    function pendingRevenue() external view returns (uint256 toLockbox, uint256 toAgent) {
        uint256 balance = asset.balanceOf(address(this));
        toLockbox = (balance * repaymentRateBps) / 10000;
        toAgent = balance - toLockbox;
    }

    receive() external payable {}
}
