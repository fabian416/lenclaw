// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentVaultFactory {
    event VaultCreated(uint256 indexed agentId, address indexed vault, address indexed agentWallet);
    event LockboxCreated(uint256 indexed agentId, address indexed lockbox, address indexed vault);
    event DefaultProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event DefaultDepositCapUpdated(uint256 oldCap, uint256 newCap);
    event TreasuryUpdated(address indexed treasury);
    event RecoveryManagerUpdated(address indexed recoveryManager);

    function createVault(uint256 agentId) external returns (address vault);
    function setVaultCreditLine(uint256 agentId, address creditLine) external;
    function getVault(uint256 agentId) external view returns (address);
    function getLockbox(uint256 agentId) external view returns (address);
    function totalVaults() external view returns (uint256);
    function vaults(uint256 agentId) external view returns (address);
    function freezeVault(uint256 agentId, bool _frozen) external;
    function writeDownVaultLoss(uint256 agentId, uint256 lossAmount) external;
    function setTreasury(address _treasury) external;
    function treasury() external view returns (address);
    function setRecoveryManager(address _recoveryManager) external;
    function recoveryManager() external view returns (address);
}
