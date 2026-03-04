// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRevenueLockbox} from "./interfaces/IRevenueLockbox.sol";

/// @title X402Receipt - On-chain payment receipt for x402 micropayments
/// @notice Records x402 payment receipts on-chain with payer, payee, amount,
///         timestamp, and service URL. Integrates with RevenueLockbox so that
///         x402 payments auto-count as agent revenue for credit building.
/// @dev Each receipt is stored as a struct with a unique incrementing ID.
///      Queryable by payer, payee, or receipt ID. Payments routed through a
///      RevenueLockbox are automatically forwarded for revenue processing.
contract X402Receipt {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ //
    // Types
    // ------------------------------------------------------------------ //

    struct Receipt {
        uint256 id;
        address payer;
        address payee;
        uint256 amount;
        uint256 timestamp;
        string serviceUrl;
        address token;
        bytes32 nonce;
        bool settled;
    }

    // ------------------------------------------------------------------ //
    // State
    // ------------------------------------------------------------------ //

    /// @notice Total number of receipts recorded
    uint256 public receiptCount;

    /// @notice USDC token contract on Base
    IERC20 public immutable usdc;

    /// @notice Protocol admin (can pause in emergencies)
    address public admin;

    /// @notice Whether the contract is paused
    bool public paused;

    /// @notice Receipt storage by ID
    mapping(uint256 => Receipt) public receipts;

    /// @notice Receipt IDs by payer address
    mapping(address => uint256[]) public payerReceipts;

    /// @notice Receipt IDs by payee address
    mapping(address => uint256[]) public payeeReceipts;

    /// @notice Used nonces to prevent duplicate receipts
    mapping(bytes32 => bool) public usedNonces;

    /// @notice Known RevenueLockbox addresses for auto-routing
    mapping(address => bool) public registeredLockboxes;

    /// @notice Total payment volume processed
    uint256 public totalVolume;

    /// @notice Total payment volume per payee
    mapping(address => uint256) public payeeVolume;

    // ------------------------------------------------------------------ //
    // Events
    // ------------------------------------------------------------------ //

    event ReceiptRecorded(
        uint256 indexed receiptId,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        string serviceUrl,
        bytes32 nonce
    );

    event ReceiptSettled(
        uint256 indexed receiptId,
        bytes32 indexed txHash
    );

    event LockboxRegistered(address indexed lockbox);
    event LockboxUnregistered(address indexed lockbox);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ------------------------------------------------------------------ //
    // Modifiers
    // ------------------------------------------------------------------ //

    modifier onlyAdmin() {
        require(msg.sender == admin, "X402Receipt: not admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "X402Receipt: paused");
        _;
    }

    // ------------------------------------------------------------------ //
    // Constructor
    // ------------------------------------------------------------------ //

    /// @param _usdc USDC token address on Base
    /// @param _admin Protocol admin address
    constructor(address _usdc, address _admin) {
        require(_usdc != address(0), "X402Receipt: zero usdc");
        require(_admin != address(0), "X402Receipt: zero admin");

        usdc = IERC20(_usdc);
        admin = _admin;
    }

    // ------------------------------------------------------------------ //
    // Core: Record receipts
    // ------------------------------------------------------------------ //

    /// @notice Record a new x402 payment receipt
    /// @param _payee Payment recipient address
    /// @param _amount Payment amount in USDC (6 decimals)
    /// @param _serviceUrl URL of the service/resource paid for
    /// @param _nonce Unique payment nonce (prevents duplicates)
    /// @return receiptId The ID of the newly created receipt
    function recordPayment(
        address _payee,
        uint256 _amount,
        string calldata _serviceUrl,
        bytes32 _nonce
    ) external whenNotPaused returns (uint256 receiptId) {
        require(_payee != address(0), "X402Receipt: zero payee");
        require(_amount > 0, "X402Receipt: zero amount");
        require(!usedNonces[_nonce], "X402Receipt: nonce already used");

        // Transfer USDC from payer to this contract (or directly to payee/lockbox)
        usdc.safeTransferFrom(msg.sender, address(this), _amount);

        // Mark nonce as used
        usedNonces[_nonce] = true;

        // Create receipt
        receiptId = receiptCount++;
        receipts[receiptId] = Receipt({
            id: receiptId,
            payer: msg.sender,
            payee: _payee,
            amount: _amount,
            timestamp: block.timestamp,
            serviceUrl: _serviceUrl,
            token: address(usdc),
            nonce: _nonce,
            settled: false
        });

        // Index by payer and payee
        payerReceipts[msg.sender].push(receiptId);
        payeeReceipts[_payee].push(receiptId);

        // Update volume tracking
        totalVolume += _amount;
        payeeVolume[_payee] += _amount;

        // Route payment to payee (or lockbox for revenue processing)
        _routePayment(_payee, _amount, receiptId);

        emit ReceiptRecorded(receiptId, msg.sender, _payee, _amount, _serviceUrl, _nonce);
    }

    /// @notice Record a payment receipt without transferring tokens
    /// @dev Used when the payment was already settled off-chain or via facilitator.
    ///      Only callable by admin to prevent false receipts.
    /// @param _payer The payer address
    /// @param _payee The payee address
    /// @param _amount Payment amount
    /// @param _serviceUrl Service URL
    /// @param _nonce Payment nonce
    /// @return receiptId The ID of the recorded receipt
    function recordSettledPayment(
        address _payer,
        address _payee,
        uint256 _amount,
        string calldata _serviceUrl,
        bytes32 _nonce
    ) external onlyAdmin whenNotPaused returns (uint256 receiptId) {
        require(_payer != address(0), "X402Receipt: zero payer");
        require(_payee != address(0), "X402Receipt: zero payee");
        require(_amount > 0, "X402Receipt: zero amount");
        require(!usedNonces[_nonce], "X402Receipt: nonce already used");

        usedNonces[_nonce] = true;

        receiptId = receiptCount++;
        receipts[receiptId] = Receipt({
            id: receiptId,
            payer: _payer,
            payee: _payee,
            amount: _amount,
            timestamp: block.timestamp,
            serviceUrl: _serviceUrl,
            token: address(usdc),
            nonce: _nonce,
            settled: true
        });

        payerReceipts[_payer].push(receiptId);
        payeeReceipts[_payee].push(receiptId);

        totalVolume += _amount;
        payeeVolume[_payee] += _amount;

        emit ReceiptRecorded(receiptId, _payer, _payee, _amount, _serviceUrl, _nonce);
    }

    // ------------------------------------------------------------------ //
    // Payment routing with RevenueLockbox integration
    // ------------------------------------------------------------------ //

    /// @dev Route payment to the payee. If the payee is a registered
    ///      RevenueLockbox, sends USDC there so processRevenue() can
    ///      split between debt repayment and agent payout.
    function _routePayment(
        address _payee,
        uint256 _amount,
        uint256 _receiptId
    ) internal {
        // Transfer USDC to the payee (or lockbox)
        usdc.safeTransfer(_payee, _amount);

        // Mark as settled
        receipts[_receiptId].settled = true;

        // If payee is a registered lockbox, trigger revenue processing
        if (registeredLockboxes[_payee]) {
            // Call processRevenue on the lockbox to split payment
            // between debt repayment and agent payout
            try IRevenueLockbox(_payee).processRevenue() {
                // Revenue processed successfully
            } catch {
                // Lockbox processing failed but payment was delivered.
                // Revenue will be processed on the next call to processRevenue().
            }
        }
    }

    // ------------------------------------------------------------------ //
    // Queries
    // ------------------------------------------------------------------ //

    /// @notice Get a receipt by ID
    function getReceipt(uint256 _receiptId) external view returns (Receipt memory) {
        require(_receiptId < receiptCount, "X402Receipt: invalid receipt id");
        return receipts[_receiptId];
    }

    /// @notice Get all receipt IDs for a payer
    function getPayerReceiptIds(address _payer) external view returns (uint256[] memory) {
        return payerReceipts[_payer];
    }

    /// @notice Get all receipt IDs for a payee
    function getPayeeReceiptIds(address _payee) external view returns (uint256[] memory) {
        return payeeReceipts[_payee];
    }

    /// @notice Get the count of receipts for a payer
    function getPayerReceiptCount(address _payer) external view returns (uint256) {
        return payerReceipts[_payer].length;
    }

    /// @notice Get the count of receipts for a payee
    function getPayeeReceiptCount(address _payee) external view returns (uint256) {
        return payeeReceipts[_payee].length;
    }

    /// @notice Get paginated receipts for a payer
    /// @param _payer Payer address
    /// @param _offset Starting index
    /// @param _limit Maximum number of receipts to return
    function getPayerReceiptsPaginated(
        address _payer,
        uint256 _offset,
        uint256 _limit
    ) external view returns (Receipt[] memory) {
        uint256[] storage ids = payerReceipts[_payer];
        uint256 total = ids.length;

        if (_offset >= total) {
            return new Receipt[](0);
        }

        uint256 end = _offset + _limit;
        if (end > total) {
            end = total;
        }

        uint256 count = end - _offset;
        Receipt[] memory result = new Receipt[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = receipts[ids[_offset + i]];
        }

        return result;
    }

    /// @notice Get paginated receipts for a payee
    /// @param _payee Payee address
    /// @param _offset Starting index
    /// @param _limit Maximum number of receipts to return
    function getPayeeReceiptsPaginated(
        address _payee,
        uint256 _offset,
        uint256 _limit
    ) external view returns (Receipt[] memory) {
        uint256[] storage ids = payeeReceipts[_payee];
        uint256 total = ids.length;

        if (_offset >= total) {
            return new Receipt[](0);
        }

        uint256 end = _offset + _limit;
        if (end > total) {
            end = total;
        }

        uint256 count = end - _offset;
        Receipt[] memory result = new Receipt[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = receipts[ids[_offset + i]];
        }

        return result;
    }

    // ------------------------------------------------------------------ //
    // Lockbox management
    // ------------------------------------------------------------------ //

    /// @notice Register a RevenueLockbox address for auto-routing
    /// @param _lockbox The lockbox contract address
    function registerLockbox(address _lockbox) external onlyAdmin {
        require(_lockbox != address(0), "X402Receipt: zero lockbox");
        require(!registeredLockboxes[_lockbox], "X402Receipt: already registered");

        registeredLockboxes[_lockbox] = true;
        emit LockboxRegistered(_lockbox);
    }

    /// @notice Unregister a RevenueLockbox address
    /// @param _lockbox The lockbox contract address
    function unregisterLockbox(address _lockbox) external onlyAdmin {
        require(registeredLockboxes[_lockbox], "X402Receipt: not registered");

        registeredLockboxes[_lockbox] = false;
        emit LockboxUnregistered(_lockbox);
    }

    // ------------------------------------------------------------------ //
    // Admin
    // ------------------------------------------------------------------ //

    /// @notice Transfer admin role to a new address
    function transferAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "X402Receipt: zero admin");

        address oldAdmin = admin;
        admin = _newAdmin;
        emit AdminTransferred(oldAdmin, _newAdmin);
    }

    /// @notice Pause the contract (emergency stop)
    function pause() external onlyAdmin {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Unpause the contract
    function unpause() external onlyAdmin {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Rescue stuck tokens (emergency only)
    /// @param _token Token address to rescue
    /// @param _to Recipient address
    /// @param _amount Amount to rescue
    function rescueTokens(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyAdmin {
        require(_to != address(0), "X402Receipt: zero recipient");

        IERC20(_token).safeTransfer(_to, _amount);
    }
}
