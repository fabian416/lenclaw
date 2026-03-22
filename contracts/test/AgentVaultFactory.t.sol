// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDCFactory is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AgentVaultFactoryTest is Test {
    MockUSDCFactory usdc;
    AgentRegistry registry;
    AgentVaultFactory factory;

    address owner = address(this);
    address agent1Wallet = makeAddr("agent1");
    address agent2Wallet = makeAddr("agent2");
    address agent3Wallet = makeAddr("agent3");

    function setUp() public {
        usdc = new MockUSDCFactory();
        registry = new AgentRegistry(owner);
        factory = new AgentVaultFactory(address(registry), owner);
        factory.setAllowedAsset(address(usdc), true);
        registry.setVaultFactory(address(factory));
    }

    function test_createVault() public {
        uint256 agentId =
            registry.registerAgent(agent1Wallet, keccak256("code"), "Agent1", address(0), 0, bytes32(0), address(0));
        address vaultAddr = factory.createVault(agentId, address(usdc));

        assertTrue(vaultAddr != address(0), "Vault should be deployed");
        assertEq(factory.vaults(agentId), vaultAddr);
        assertEq(factory.getVault(agentId), vaultAddr);
        assertEq(factory.totalVaults(), 1);

        AgentVault vault = AgentVault(vaultAddr);
        assertEq(vault.agentId(), agentId);
        assertEq(vault.asset(), address(usdc));
    }

    function test_createMultipleVaults() public {
        uint256 id1 =
            registry.registerAgent(agent1Wallet, keccak256("code1"), "Agent1", address(0), 0, bytes32(0), address(0));
        uint256 id2 =
            registry.registerAgent(agent2Wallet, keccak256("code2"), "Agent2", address(0), 0, bytes32(0), address(0));
        uint256 id3 =
            registry.registerAgent(agent3Wallet, keccak256("code3"), "Agent3", address(0), 0, bytes32(0), address(0));

        address v1 = factory.createVault(id1, address(usdc));
        address v2 = factory.createVault(id2, address(usdc));
        address v3 = factory.createVault(id3, address(usdc));

        assertTrue(v1 != v2 && v2 != v3, "Vaults should be unique");
        assertEq(factory.totalVaults(), 3);

        // Verify unique names
        assertEq(AgentVault(v1).name(), "Lenclaw Agent 1 Vault");
        assertEq(AgentVault(v2).name(), "Lenclaw Agent 2 Vault");
        assertEq(AgentVault(v3).name(), "Lenclaw Agent 3 Vault");
    }

    function test_cannotCreateDuplicateVault() public {
        uint256 agentId =
            registry.registerAgent(agent1Wallet, keccak256("code"), "Agent1", address(0), 0, bytes32(0), address(0));
        factory.createVault(agentId, address(usdc));

        vm.expectRevert(abi.encodeWithSelector(AgentVaultFactory.VaultAlreadyExists.selector, agentId));
        factory.createVault(agentId, address(usdc));
    }

    function test_cannotCreateVaultForUnregisteredAgent() public {
        uint256 fakeAgentId = 999;

        vm.expectRevert(abi.encodeWithSelector(AgentVaultFactory.AgentNotRegistered.selector, fakeAgentId));
        factory.createVault(fakeAgentId, address(usdc));
    }

    function test_setVaultCreditLine() public {
        uint256 agentId =
            registry.registerAgent(agent1Wallet, keccak256("code"), "Agent1", address(0), 0, bytes32(0), address(0));
        factory.createVault(agentId, address(usdc));

        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        AgentVault vault = AgentVault(factory.getVault(agentId));
        assertEq(vault.creditLine(), creditLine);
    }

    function test_onlyOwnerCanSetCreditLine() public {
        uint256 agentId =
            registry.registerAgent(agent1Wallet, keccak256("code"), "Agent1", address(0), 0, bytes32(0), address(0));
        factory.createVault(agentId, address(usdc));

        vm.prank(agent1Wallet);
        vm.expectRevert();
        factory.setVaultCreditLine(agentId, makeAddr("creditLine"));
    }

    function test_setVaultDepositCap() public {
        uint256 agentId =
            registry.registerAgent(agent1Wallet, keccak256("code"), "Agent1", address(0), 0, bytes32(0), address(0));
        factory.createVault(agentId, address(usdc));

        factory.setVaultDepositCap(agentId, 1_000_000e6);

        AgentVault vault = AgentVault(factory.getVault(agentId));
        assertEq(vault.depositCap(), 1_000_000e6);
    }

    function test_setDefaultProtocolFee() public {
        factory.setDefaultProtocolFeeBps(500); // 5%

        uint256 agentId =
            registry.registerAgent(agent1Wallet, keccak256("code"), "Agent1", address(0), 0, bytes32(0), address(0));
        address vaultAddr = factory.createVault(agentId, address(usdc));

        assertEq(AgentVault(vaultAddr).protocolFeeBps(), 500);
    }

    function test_cannotSetFeeTooHigh() public {
        vm.expectRevert("AgentVaultFactory: fee too high");
        factory.setDefaultProtocolFeeBps(5000); // 50% - too high
    }

    function test_setDefaultDepositCap() public {
        factory.setDefaultDepositCap(1_000_000e6);

        uint256 agentId =
            registry.registerAgent(agent1Wallet, keccak256("code"), "Agent1", address(0), 0, bytes32(0), address(0));
        address vaultAddr = factory.createVault(agentId, address(usdc));

        assertEq(AgentVault(vaultAddr).depositCap(), 1_000_000e6);
    }

    function test_vaultNotFoundReverts() public {
        uint256 fakeId = 999;

        vm.expectRevert(abi.encodeWithSelector(AgentVaultFactory.VaultNotFound.selector, fakeId));
        factory.setVaultCreditLine(fakeId, makeAddr("cl"));

        vm.expectRevert(abi.encodeWithSelector(AgentVaultFactory.VaultNotFound.selector, fakeId));
        factory.setVaultDepositCap(fakeId, 1e6);

        vm.expectRevert(abi.encodeWithSelector(AgentVaultFactory.VaultNotFound.selector, fakeId));
        factory.setVaultProtocolFee(fakeId, 100);

        vm.expectRevert(abi.encodeWithSelector(AgentVaultFactory.VaultNotFound.selector, fakeId));
        factory.collectVaultFees(fakeId, owner);
    }

    function test_onlyRegistryOrOwnerCanCreateVault() public {
        uint256 agentId =
            registry.registerAgent(agent1Wallet, keccak256("code"), "Agent1", address(0), 0, bytes32(0), address(0));

        // Non-owner/non-registry cannot create vault
        vm.prank(agent1Wallet);
        vm.expectRevert("AgentVaultFactory: not authorized");
        factory.createVault(agentId, address(usdc));
    }

    function test_allVaultsEnumeration() public {
        uint256 id1 =
            registry.registerAgent(agent1Wallet, keccak256("code1"), "Agent1", address(0), 0, bytes32(0), address(0));
        uint256 id2 =
            registry.registerAgent(agent2Wallet, keccak256("code2"), "Agent2", address(0), 0, bytes32(0), address(0));

        address v1 = factory.createVault(id1, address(usdc));
        address v2 = factory.createVault(id2, address(usdc));

        assertEq(factory.allVaults(0), v1);
        assertEq(factory.allVaults(1), v2);
        assertEq(factory.totalVaults(), 2);
    }
}
