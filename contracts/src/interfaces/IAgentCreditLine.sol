// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentCreditLine {
    // --- Enums ---
    enum Status {
        ACTIVE,
        DELINQUENT,
        DEFAULT
    }

    // --- Structs ---
    struct CreditFacility {
        uint256 principal;
        uint256 accruedInterest;
        uint256 lastAccrualTimestamp;
        uint256 interestRateBps;
        uint256 creditLimit;
        Status status;
    }

    // --- Events ---
    event Drawdown(uint256 indexed agentId, uint256 amount);
    event Repayment(uint256 indexed agentId, uint256 amount, uint256 interestPaid, uint256 principalPaid);
    event StatusChanged(uint256 indexed agentId, Status oldStatus, Status newStatus);
    event CreditLineRefreshed(uint256 indexed agentId, uint256 newLimit, uint256 newRate);
    event DebtWrittenDown(uint256 indexed agentId, uint256 amount);

    // --- External / Public functions ---
    function drawdown(uint256 agentId, uint256 amount) external;
    function repay(uint256 agentId, uint256 amount) external;
    function refreshCreditLine(uint256 agentId) external;
    function updateStatus(uint256 agentId) external;
    function writeDown(uint256 agentId, uint256 amount) external;

    // --- Owner-only setters ---
    function setVaultFactory(address _vaultFactory) external;
    function setRecoveryManager(address _recoveryManager) external;
    function setGracePeriod(uint256 _period) external;
    function setDefaultPeriod(uint256 _period) external;
    function setRequireSmartWallet(bool _require) external;
    function pause() external;
    function unpause() external;

    // --- View functions ---
    function getOutstanding(uint256 agentId) external view returns (uint256);
    function getStatus(uint256 agentId) external view returns (Status);
    function facilities(uint256 agentId)
        external
        view
        returns (
            uint256 principal,
            uint256 accruedInterest,
            uint256 lastAccrualTimestamp,
            uint256 interestRateBps,
            uint256 creditLimit,
            Status status
        );
    function lastPaymentTimestamp(uint256 agentId) external view returns (uint256);
    function recoveryManager() external view returns (address);
    function gracePeriod() external view returns (uint256);
    function defaultPeriod() external view returns (uint256);
    function requireSmartWallet() external view returns (bool);
}
