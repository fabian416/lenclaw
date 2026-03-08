// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentVault {
    event Borrowed(address indexed borrower, uint256 amount);
    event RepaymentReceived(address indexed from, uint256 amount);
    event FeesCollected(address indexed to, uint256 amount);
    event CreditLineSet(address indexed creditLine);
    event DepositCapSet(uint256 newCap);

    function agentId() external view returns (uint256);
    function factory() external view returns (address);
    function creditLine() external view returns (address);
    function totalBorrowed() external view returns (uint256);
    function totalRevenueReceived() external view returns (uint256);
    function depositCap() external view returns (uint256);

    function borrow(address to, uint256 amount) external;
    function receiveRepayment(uint256 amount) external;
    function requestWithdrawal() external;
    function setFrozen(bool frozen) external;
    function setWithdrawalDelay(uint256 delay) external;
    function availableLiquidity() external view returns (uint256);
    function utilizationRate() external view returns (uint256);
    function totalBacked() external view returns (uint256);
    function frozen() external view returns (bool);
}
