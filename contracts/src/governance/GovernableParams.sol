// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GovernableParams - Abstract contract for governed protocol parameters
/// @notice Provides setter functions and an onlyGovernance modifier for protocol parameters
///         that can only be changed through the governance timelock.
abstract contract GovernableParams {
    /// @notice The governance address (timelock controller) that can modify parameters
    address public governance;

    // --------------- Protocol parameters ---------------

    /// @notice Protocol fee in basis points (e.g., 1000 = 10%)
    uint256 public protocolFeeBps;

    /// @notice Cooldown period for pool withdrawals (in seconds)
    uint256 public withdrawalCooldownPeriod;

    /// @notice Maximum utilization rate in basis points (e.g., 9000 = 90%)
    uint256 public maxUtilizationBps;

    /// @notice Minimum credit score required for agent borrowing (0-1000 scale)
    uint256 public minCreditScore;

    // --------------- Events ---------------

    event GovernanceTransferred(address indexed previousGovernance, address indexed newGovernance);
    event ProtocolFeeBpsUpdated(uint256 oldValue, uint256 newValue);
    event WithdrawalCooldownPeriodUpdated(uint256 oldValue, uint256 newValue);
    event MaxUtilizationBpsUpdated(uint256 oldValue, uint256 newValue);
    event MinCreditScoreUpdated(uint256 oldValue, uint256 newValue);

    // --------------- Errors ---------------

    error NotGovernance(address caller);
    error InvalidFeeBps(uint256 value);
    error InvalidUtilizationBps(uint256 value);
    error InvalidCreditScore(uint256 value);
    error ZeroAddress();

    // --------------- Modifier ---------------

    /// @notice Restricts function access to the governance address (timelock)
    modifier onlyGovernance() {
        if (msg.sender != governance) {
            revert NotGovernance(msg.sender);
        }
        _;
    }

    // --------------- Constructor ---------------

    /// @param _governance The governance address (typically the timelock controller)
    /// @param _protocolFeeBps Initial protocol fee in basis points
    /// @param _withdrawalCooldownPeriod Initial pool withdrawal cooldown period
    /// @param _maxUtilizationBps Initial max utilization rate in basis points
    /// @param _minCreditScore Initial minimum credit score
    constructor(
        address _governance,
        uint256 _protocolFeeBps,
        uint256 _withdrawalCooldownPeriod,
        uint256 _maxUtilizationBps,
        uint256 _minCreditScore
    ) {
        if (_governance == address(0)) revert ZeroAddress();
        if (_protocolFeeBps > 3000) revert InvalidFeeBps(_protocolFeeBps);
        if (_maxUtilizationBps > 10_000) revert InvalidUtilizationBps(_maxUtilizationBps);
        if (_minCreditScore > 1000) revert InvalidCreditScore(_minCreditScore);

        governance = _governance;
        protocolFeeBps = _protocolFeeBps;
        withdrawalCooldownPeriod = _withdrawalCooldownPeriod;
        maxUtilizationBps = _maxUtilizationBps;
        minCreditScore = _minCreditScore;
    }

    // --------------- Setters ---------------

    /// @notice Transfer governance to a new address
    /// @param _governance New governance address
    function setGovernance(address _governance) external onlyGovernance {
        if (_governance == address(0)) revert ZeroAddress();
        address old = governance;
        governance = _governance;
        emit GovernanceTransferred(old, _governance);
    }

    /// @notice Update the protocol fee (max 30% = 3000 bps)
    /// @param _protocolFeeBps New protocol fee in basis points
    function setProtocolFeeBps(uint256 _protocolFeeBps) external onlyGovernance {
        if (_protocolFeeBps > 3000) revert InvalidFeeBps(_protocolFeeBps);
        uint256 old = protocolFeeBps;
        protocolFeeBps = _protocolFeeBps;
        emit ProtocolFeeBpsUpdated(old, _protocolFeeBps);
    }

    /// @notice Update the pool withdrawal cooldown period
    /// @param _withdrawalCooldownPeriod New cooldown period in seconds
    function setWithdrawalCooldownPeriod(uint256 _withdrawalCooldownPeriod) external onlyGovernance {
        uint256 old = withdrawalCooldownPeriod;
        withdrawalCooldownPeriod = _withdrawalCooldownPeriod;
        emit WithdrawalCooldownPeriodUpdated(old, _withdrawalCooldownPeriod);
    }

    /// @notice Update the maximum utilization rate (max 100% = 10000 bps)
    /// @param _maxUtilizationBps New max utilization rate in basis points
    function setMaxUtilizationBps(uint256 _maxUtilizationBps) external onlyGovernance {
        if (_maxUtilizationBps > 10_000) revert InvalidUtilizationBps(_maxUtilizationBps);
        uint256 old = maxUtilizationBps;
        maxUtilizationBps = _maxUtilizationBps;
        emit MaxUtilizationBpsUpdated(old, _maxUtilizationBps);
    }

    /// @notice Update the minimum credit score for borrowing (0-1000 scale)
    /// @param _minCreditScore New minimum credit score
    function setMinCreditScore(uint256 _minCreditScore) external onlyGovernance {
        if (_minCreditScore > 1000) revert InvalidCreditScore(_minCreditScore);
        uint256 old = minCreditScore;
        minCreditScore = _minCreditScore;
        emit MinCreditScoreUpdated(old, _minCreditScore);
    }
}
