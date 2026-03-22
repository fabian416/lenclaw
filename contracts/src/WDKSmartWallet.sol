// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title WDKSmartWallet - ERC-4337 compatible revenue-routing smart wallet for WDK agents
/// @notice Extends AgentSmartWallet functionality with ERC-4337 account abstraction support.
///         Implements IAccount.validateUserOp for bundler-submitted UserOperations.
///         Maintains the same revenue-routing guarantee: all revenue is auto-routed to lockbox
///         before any execute or batch execute call.
contract WDKSmartWallet is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // --- ERC-4337 PackedUserOperation ---
    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        bytes32 accountGasLimits;
        uint256 preVerificationGas;
        bytes32 gasFees;
        bytes paymasterAndData;
        bytes signature;
    }

    // --- Immutables (same as AgentSmartWallet) ---
    address public immutable owner; // Agent operator (EOA signer)
    address public immutable protocol; // Factory that deployed this
    address public immutable lockbox; // Revenue lockbox
    IERC20 public immutable asset;
    uint256 public immutable agentId;

    // --- State ---
    uint256 public repaymentRateBps; // e.g., 5000 = 50%
    mapping(address => bool) public allowedTargets;
    uint256 public totalRouted; // Track total routed to lockbox

    // --- ERC-4337 state ---
    address public entryPoint; // ERC-4337 EntryPoint contract
    uint256 private _nonce; // Internal nonce for UserOp replay protection

    // --- Constants ---
    uint256 public constant SIG_VALIDATION_FAILED = 1;
    uint256 public constant SIG_VALIDATION_SUCCESS = 0;

    // --- Events (AgentSmartWallet compatible) ---
    event RevenueRouted(uint256 toLockbox, uint256 remaining);
    event Executed(address indexed target, uint256 value, bool success);
    event AllowedTargetSet(address indexed target, bool allowed);
    event RepaymentRateUpdated(uint256 oldRate, uint256 newRate);

    // --- WDK-specific events ---
    event UserOpValidated(bytes32 indexed userOpHash, address indexed sender, uint256 validationData);
    event WDKBatchExecuted(uint256 indexed count, address indexed sender);
    event EntryPointUpdated(address indexed oldEntryPoint, address indexed newEntryPoint);

    // --- Errors ---
    error NotOwner();
    error NotProtocol();
    error NotEntryPoint();
    error NotOwnerOrEntryPoint();
    error TargetNotAllowed();
    error ExecutionFailed();
    error InvalidSignatureLength();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProtocol() {
        if (msg.sender != protocol) revert NotProtocol();
        _;
    }

    modifier onlyEntryPoint() {
        if (msg.sender != entryPoint) revert NotEntryPoint();
        _;
    }

    modifier onlyOwnerOrEntryPoint() {
        if (msg.sender != owner && msg.sender != entryPoint) revert NotOwnerOrEntryPoint();
        _;
    }

    constructor(
        address _owner,
        address _protocol,
        address _lockbox,
        address _asset,
        uint256 _agentId,
        uint256 _repaymentRateBps,
        address _entryPoint
    ) {
        require(
            _owner != address(0) && _lockbox != address(0) && _asset != address(0) && _entryPoint != address(0),
            "zero address"
        );
        require(_repaymentRateBps <= 10000, "rate too high");
        owner = _owner;
        protocol = _protocol;
        lockbox = _lockbox;
        asset = IERC20(_asset);
        agentId = _agentId;
        repaymentRateBps = _repaymentRateBps;
        entryPoint = _entryPoint;
    }

    // ─── ERC-4337 IAccount ──────────────────────────────────────────────

    /// @notice Validates a UserOperation signature per ERC-4337.
    ///         Only the EntryPoint contract can call this.
    /// @param userOp The packed user operation
    /// @param userOpHash Hash of the user operation
    /// @param missingAccountFunds Funds the account must deposit to EntryPoint
    /// @return validationData 0 = valid, 1 = invalid signature
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
        external
        onlyEntryPoint
        returns (uint256 validationData)
    {
        // Validate signature: recover signer from userOpHash
        validationData = _validateSignature(userOp, userOpHash);

        // Increment nonce for replay protection (local tracking; EntryPoint also manages nonces)
        _nonce++;

        // Pay prefund if needed
        if (missingAccountFunds > 0) {
            (bool success,) = payable(entryPoint).call{value: missingAccountFunds}("");
            require(success, "prefund failed");
        }

        emit UserOpValidated(userOpHash, userOp.sender, validationData);
    }

    /// @notice Internal signature validation - recovers ECDSA signer from the userOpHash.
    ///         Supports both raw hash (standard ERC-4337) and eth-signed-message prefix (EOA wallets).
    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        view
        returns (uint256)
    {
        bytes memory sig = userOp.signature;
        if (sig.length != 65) return SIG_VALIDATION_FAILED;

        // Try raw hash first (standard ERC-4337 bundlers sign raw userOpHash)
        address recovered = userOpHash.recover(sig);
        if (recovered == owner) return SIG_VALIDATION_SUCCESS;

        // Fallback: try with Ethereum signed message prefix (EOA wallets like MetaMask)
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        recovered = ethSignedHash.recover(sig);
        if (recovered == owner) return SIG_VALIDATION_SUCCESS;

        return SIG_VALIDATION_FAILED;
    }

    // ─── Execute (owner or EntryPoint) ──────────────────────────────────

    /// @notice Execute a call to an allowed target. Auto-routes revenue first.
    ///         Callable by owner (direct) or EntryPoint (via UserOp).
    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyOwnerOrEntryPoint
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
    ///         Callable by owner (direct) or EntryPoint (via UserOp).
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas)
        external
        onlyOwnerOrEntryPoint
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
        emit WDKBatchExecuted(targets.length, msg.sender);
    }

    // ─── Revenue routing ────────────────────────────────────────────────

    /// @notice Manually route pending revenue (callable by anyone)
    function routeRevenue() external nonReentrant {
        _routePendingRevenue();
    }

    /// @notice Internal: split asset balance between lockbox and wallet
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

    // ─── Protocol admin ─────────────────────────────────────────────────

    function setAllowedTarget(address target, bool allowed) external onlyProtocol {
        require(target != address(asset), "WDKSmartWallet: cannot allow asset token");
        require(target != address(this), "WDKSmartWallet: cannot allow self");
        require(target != lockbox, "WDKSmartWallet: cannot allow lockbox");
        allowedTargets[target] = allowed;
        emit AllowedTargetSet(target, allowed);
    }

    function setRepaymentRate(uint256 newRate) external onlyProtocol {
        require(newRate <= 10000, "rate too high");
        uint256 oldRate = repaymentRateBps;
        repaymentRateBps = newRate;
        emit RepaymentRateUpdated(oldRate, newRate);
    }

    function setEntryPoint(address _entryPoint) external onlyProtocol {
        require(_entryPoint != address(0), "zero entry point");
        address oldEntryPoint = entryPoint;
        entryPoint = _entryPoint;
        emit EntryPointUpdated(oldEntryPoint, _entryPoint);
    }

    // ─── WDK-specific views ─────────────────────────────────────────────

    /// @notice Identifies this as a WDK wallet
    function isWDKWallet() external pure returns (bool) {
        return true;
    }

    /// @notice WDK protocol version
    function wdkVersion() external pure returns (uint256) {
        return 1;
    }

    /// @notice Get the current nonce (for ERC-4337 nonce management)
    function getNonce() external view returns (uint256) {
        return _nonce;
    }

    /// @notice View: pending revenue that would be routed
    function pendingRevenue() external view returns (uint256 toLockbox, uint256 toAgent) {
        uint256 balance = asset.balanceOf(address(this));
        toLockbox = (balance * repaymentRateBps) / 10000;
        toAgent = balance - toLockbox;
    }

    receive() external payable {}
}
