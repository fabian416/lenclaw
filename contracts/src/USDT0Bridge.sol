// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title USDT0Bridge - Cross-chain bridge adapter for USDT0 via LayerZero
/// @notice Allows agents to bridge USDT0 cross-chain. Revenue from other chains can be
///         bridged to Base and routed to the agent's lockbox. Only the agent owner can
///         initiate bridges. Integrates with the WDK bridge protocol pattern.
///
/// @dev This contract acts as an adapter between Lenclaw agents and the LayerZero USDT0
///      OFT (Omnichain Fungible Token) endpoint. It holds approval to spend USDT0 on
///      behalf of agents and calls the OFT's sendFrom to initiate cross-chain transfers.
///
///      LayerZero OFT interface (simplified):
///        function sendFrom(
///            address _from, uint16 _dstChainId, bytes32 _toAddress,
///            uint256 _amount, LzCallParams calldata _callParams
///        ) external payable;
contract USDT0Bridge is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- LayerZero types ---
    struct LzCallParams {
        address payable refundAddress;
        address zroPaymentAddress;
        bytes adapterParams;
    }

    struct SendParam {
        uint32 dstEid; // LayerZero v2 destination endpoint ID
        bytes32 to; // Recipient address as bytes32
        uint256 amountLD; // Amount in local decimals
        uint256 minAmountLD; // Minimum amount after fees
        bytes extraOptions; // Extra LayerZero options
        bytes composeMsg; // Compose message for destination
        bytes oftCmd; // OFT command bytes
    }

    struct MessagingFee {
        uint256 nativeFee;
        uint256 lzTokenFee;
    }

    // --- State ---
    IERC20 public immutable usdt0; // USDT0 token on this chain
    IAgentRegistry public registry;
    address public lzEndpoint; // LayerZero OFT endpoint for USDT0

    // Supported destination chains (LayerZero v2 endpoint IDs)
    mapping(uint32 => bool) public supportedChains;

    // Bridge tracking
    uint256 public totalBridgedOut;
    uint256 public totalBridgedIn;
    uint256 public bridgeNonce;

    // Per-agent bridge tracking
    mapping(uint256 => uint256) public agentBridgedOut; // agentId => total bridged out
    mapping(uint256 => uint256) public agentBridgedIn; // agentId => total bridged in

    // Bridge request status
    enum BridgeStatus {
        PENDING,
        COMPLETED,
        FAILED
    }

    struct BridgeRequest {
        uint256 agentId;
        uint32 dstEid;
        uint256 amount;
        address recipient;
        BridgeStatus status;
        uint256 timestamp;
    }

    mapping(uint256 => BridgeRequest) public bridgeRequests; // nonce => request

    // --- Events ---
    event BridgeInitiated(
        uint256 indexed nonce, uint256 indexed agentId, uint32 indexed dstEid, address recipient, uint256 amount
    );
    event BridgeCompleted(uint256 indexed nonce, uint256 indexed agentId, uint256 amount);
    event BridgeFailed(uint256 indexed nonce, uint256 indexed agentId, uint256 amount);
    event RevenueReceivedFromBridge(uint256 indexed agentId, address indexed lockbox, uint256 amount);
    event SupportedChainUpdated(uint32 indexed eid, bool supported);
    event LzEndpointUpdated(address indexed oldEndpoint, address indexed newEndpoint);

    // --- Errors ---
    error ChainNotSupported(uint32 eid);
    error NotAgentOwner();
    error ZeroAmount();
    error InsufficientBalance();
    error AgentNotRegistered();
    error NoLockbox();

    constructor(address _usdt0, address _registry, address _lzEndpoint, address _owner) Ownable(_owner) {
        require(_usdt0 != address(0) && _registry != address(0), "zero address");
        usdt0 = IERC20(_usdt0);
        registry = IAgentRegistry(_registry);
        lzEndpoint = _lzEndpoint;
    }

    // ─── Bridge Out: Send USDT0 to another chain ────────────────────────

    /// @notice Bridge USDT0 to another chain via LayerZero.
    ///         Only the agent's registered wallet owner can initiate.
    /// @param agentId The agent initiating the bridge
    /// @param dstEid LayerZero v2 destination endpoint ID
    /// @param recipient The recipient address on the destination chain
    /// @param amount Amount of USDT0 to bridge
    /// @param minAmount Minimum amount to receive after fees (slippage protection)
    /// @return nonce The bridge request nonce for tracking
    function bridgeOut(uint256 agentId, uint32 dstEid, address recipient, uint256 amount, uint256 minAmount)
        external
        payable
        nonReentrant
        returns (uint256 nonce)
    {
        if (amount == 0) revert ZeroAmount();
        require(minAmount <= amount, "minAmount exceeds amount");
        if (!supportedChains[dstEid]) revert ChainNotSupported(dstEid);

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        if (profile.wallet == address(0)) revert AgentNotRegistered();

        // Only the agent owner (operator EOA) can bridge
        if (msg.sender != profile.wallet) revert NotAgentOwner();

        // Transfer USDT0 from sender to this contract
        usdt0.safeTransferFrom(msg.sender, address(this), amount);

        // Record bridge request
        nonce = bridgeNonce++;
        bridgeRequests[nonce] = BridgeRequest({
            agentId: agentId,
            dstEid: dstEid,
            amount: amount,
            recipient: recipient,
            status: BridgeStatus.PENDING,
            timestamp: block.timestamp
        });

        agentBridgedOut[agentId] += amount;
        totalBridgedOut += amount;

        // Call LayerZero OFT endpoint if set
        if (lzEndpoint != address(0)) {
            usdt0.forceApprove(lzEndpoint, amount);

            // Encode the LayerZero send call
            // Using the OFT send interface: send(SendParam, MessagingFee, refundAddress)
            SendParam memory sendParam = SendParam({
                dstEid: dstEid,
                to: _addressToBytes32(recipient),
                amountLD: amount,
                minAmountLD: minAmount,
                extraOptions: "",
                composeMsg: "",
                oftCmd: ""
            });

            MessagingFee memory fee = MessagingFee({nativeFee: msg.value, lzTokenFee: 0});

            // Call the OFT send function
            // solhint-disable-next-line avoid-low-level-calls
            (bool success,) = lzEndpoint.call{value: msg.value}(
                abi.encodeWithSignature(
                    "send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address)",
                    sendParam,
                    fee,
                    msg.sender // refund address
                )
            );

            if (success) {
                bridgeRequests[nonce].status = BridgeStatus.COMPLETED;
            } else {
                // If LZ call fails, return funds and mark failed
                bridgeRequests[nonce].status = BridgeStatus.FAILED;
                usdt0.safeTransfer(msg.sender, amount);
                agentBridgedOut[agentId] -= amount;
                totalBridgedOut -= amount;
                emit BridgeFailed(nonce, agentId, amount);
                return nonce;
            }

            usdt0.forceApprove(lzEndpoint, 0);
        } else {
            // No LZ endpoint: mark as completed (for testing / manual bridging)
            bridgeRequests[nonce].status = BridgeStatus.COMPLETED;
        }

        emit BridgeInitiated(nonce, agentId, dstEid, recipient, amount);
    }

    // ─── Bridge In: Receive USDT0 from another chain and route to lockbox ─

    /// @notice Receive bridged USDT0 and route it to the agent's lockbox.
    ///         Called after USDT0 arrives on this chain (manually or via relayer).
    ///         Anyone can call this to route funds sitting in this contract to the right lockbox.
    /// @param agentId The agent whose lockbox should receive the funds
    /// @param amount Amount to route to the lockbox
    function routeBridgedRevenue(uint256 agentId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        if (profile.wallet == address(0)) revert AgentNotRegistered();
        if (profile.lockbox == address(0)) revert NoLockbox();

        uint256 balance = usdt0.balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance();

        // Transfer USDT0 to the agent's lockbox for revenue processing
        usdt0.safeTransfer(profile.lockbox, amount);

        agentBridgedIn[agentId] += amount;
        totalBridgedIn += amount;

        emit RevenueReceivedFromBridge(agentId, profile.lockbox, amount);
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function setSupportedChain(uint32 eid, bool supported) external onlyOwner {
        supportedChains[eid] = supported;
        emit SupportedChainUpdated(eid, supported);
    }

    function setLzEndpoint(address _lzEndpoint) external onlyOwner {
        address oldEndpoint = lzEndpoint;
        lzEndpoint = _lzEndpoint;
        emit LzEndpointUpdated(oldEndpoint, _lzEndpoint);
    }

    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "zero registry");
        registry = IAgentRegistry(_registry);
    }

    // ─── View functions ─────────────────────────────────────────────────

    function getBridgeRequest(uint256 nonce) external view returns (BridgeRequest memory) {
        return bridgeRequests[nonce];
    }

    function getAgentBridgeStats(uint256 agentId) external view returns (uint256 bridgedOut, uint256 bridgedIn) {
        return (agentBridgedOut[agentId], agentBridgedIn[agentId]);
    }

    /// @notice Estimate LayerZero fee for a bridge operation (calls LZ endpoint quoteSend)
    /// @return nativeFee The estimated native fee for the bridge operation
    /// @return available Whether the fee estimate is available (false if no endpoint or call fails)
    function estimateBridgeFee(uint32 dstEid, uint256 amount)
        external
        view
        returns (uint256 nativeFee, bool available)
    {
        if (lzEndpoint == address(0)) return (0, false);

        SendParam memory sendParam = SendParam({
            dstEid: dstEid,
            to: bytes32(0),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: "",
            composeMsg: "",
            oftCmd: ""
        });

        // Try to call quoteSend on the LZ endpoint
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory result) = lzEndpoint.staticcall(
            abi.encodeWithSignature(
                "quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool)",
                sendParam,
                false // don't pay in LZ token
            )
        );

        if (success && result.length >= 64) {
            (nativeFee,) = abi.decode(result, (uint256, uint256));
            available = true;
        }
    }

    // ─── Rescue ─────────────────────────────────────────────────────────

    /// @notice Rescue stuck tokens (non-USDT0) from this contract
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(usdt0), "cannot rescue USDT0 directly");
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Rescue stuck ETH
    function rescueETH(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "no ETH");
        (bool success,) = to.call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    receive() external payable {}
}
