// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CrossChainRevenue - Cross-chain revenue aggregation with Chainlink CCIP pattern
/// @notice Aggregates revenue data across Base, Arbitrum, Optimism, and Polygon.
///         Uses a Chainlink CCIP-compatible message pattern for cross-chain communication.
///         The contract on each chain records local revenue and receives cross-chain messages
///         from peer contracts on other chains to build a global revenue view.
contract CrossChainRevenue is Ownable {
    // -----------------------------------------------------------------------
    // Chainlink CCIP chain selectors (official values)
    // -----------------------------------------------------------------------
    uint64 public constant CHAIN_SELECTOR_BASE = 15971525489660198786;
    uint64 public constant CHAIN_SELECTOR_ARBITRUM = 4949039107694359620;
    uint64 public constant CHAIN_SELECTOR_OPTIMISM = 3734403246176062136;
    uint64 public constant CHAIN_SELECTOR_POLYGON = 4051577828743386545;

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    /// @notice Revenue data for a single agent on a single chain
    struct ChainRevenue {
        uint256 totalRevenue;   // Cumulative revenue in USDC (6 decimals)
        uint256 lastUpdated;    // Timestamp of the last update
        bool active;            // Whether this chain has reported data
    }

    /// @notice Inbound CCIP-style message
    struct CCIPMessage {
        uint64 sourceChainSelector;
        address sender;
        bytes data;
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    /// @notice agentId => chainSelector => ChainRevenue
    mapping(uint256 => mapping(uint64 => ChainRevenue)) public agentChainRevenue;

    /// @notice agentId => aggregated cross-chain total revenue
    mapping(uint256 => uint256) public crossChainTotals;

    /// @notice Trusted peer contracts on remote chains (chainSelector => address)
    mapping(uint64 => address) public trustedPeers;

    /// @notice Authorized CCIP router address (set to Chainlink CCIP Router on each chain)
    address public ccipRouter;

    /// @notice All chain selectors we track
    uint64[] public supportedChains;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event CrossChainRevenueRecorded(
        uint256 indexed agentId, uint64 indexed chainSelector, uint256 revenue, uint256 newTotal
    );
    event LocalRevenueRecorded(uint256 indexed agentId, uint256 revenue, uint256 newTotal);
    event TrustedPeerSet(uint64 indexed chainSelector, address peer);
    event CCIPRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event CrossChainMessageReceived(uint64 indexed sourceChainSelector, address sender, uint256 agentId);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error UntrustedSource(uint64 chainSelector, address sender);
    error InvalidRouter(address caller);
    error InvalidChainSelector(uint64 chainSelector);
    error ZeroRevenue();

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    modifier onlyRouter() {
        if (msg.sender != ccipRouter) revert InvalidRouter(msg.sender);
        _;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(address _owner, address _ccipRouter) Ownable(_owner) {
        ccipRouter = _ccipRouter;

        // Initialize supported chains
        supportedChains.push(CHAIN_SELECTOR_BASE);
        supportedChains.push(CHAIN_SELECTOR_ARBITRUM);
        supportedChains.push(CHAIN_SELECTOR_OPTIMISM);
        supportedChains.push(CHAIN_SELECTOR_POLYGON);
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    /// @notice Set the CCIP router address
    function setCCIPRouter(address _router) external onlyOwner {
        address old = ccipRouter;
        ccipRouter = _router;
        emit CCIPRouterUpdated(old, _router);
    }

    /// @notice Register a trusted peer contract on a remote chain
    function setTrustedPeer(uint64 chainSelector, address peer) external onlyOwner {
        trustedPeers[chainSelector] = peer;
        emit TrustedPeerSet(chainSelector, peer);
    }

    // -----------------------------------------------------------------------
    // Local revenue recording (called by protocol on this chain)
    // -----------------------------------------------------------------------

    /// @notice Record revenue generated by an agent on THIS chain
    /// @param agentId The agent's NFT ID
    /// @param revenue Revenue amount in USDC (6 decimals)
    function recordLocalRevenue(uint256 agentId, uint256 revenue) external onlyOwner {
        if (revenue == 0) revert ZeroRevenue();

        uint64 localSelector = _getLocalChainSelector();

        ChainRevenue storage data = agentChainRevenue[agentId][localSelector];
        data.totalRevenue += revenue;
        data.lastUpdated = block.timestamp;
        data.active = true;

        // Recalculate the cross-chain total
        crossChainTotals[agentId] = _calculateTotal(agentId);

        emit LocalRevenueRecorded(agentId, revenue, crossChainTotals[agentId]);
    }

    // -----------------------------------------------------------------------
    // CCIP message handling (Chainlink CCIP receiver pattern)
    // -----------------------------------------------------------------------

    /// @notice Called by the CCIP router when a cross-chain message arrives.
    ///         Follows the Chainlink CCIPReceiver pattern.
    /// @param message The inbound CCIP message containing revenue data
    function ccipReceive(CCIPMessage calldata message) external onlyRouter {
        uint64 srcChain = message.sourceChainSelector;
        address sender = message.sender;

        // Verify the sender is a trusted peer on the source chain
        if (trustedPeers[srcChain] != sender) {
            revert UntrustedSource(srcChain, sender);
        }

        // Decode payload: (uint256 agentId, uint256 revenue)
        (uint256 agentId, uint256 revenue) = abi.decode(message.data, (uint256, uint256));

        if (revenue == 0) revert ZeroRevenue();

        // Record cross-chain revenue
        _recordCrossChainRevenue(agentId, srcChain, revenue);

        emit CrossChainMessageReceived(srcChain, sender, agentId);
    }

    /// @notice Manual recording of cross-chain revenue (for admin bridging or off-chain relayers)
    /// @dev Only callable by owner; use when CCIP is not yet configured
    /// @param agentId The agent's NFT ID
    /// @param chainSelector The source chain selector
    /// @param revenue Revenue amount in USDC (6 decimals)
    function recordCrossChainRevenue(uint256 agentId, uint64 chainSelector, uint256 revenue) external onlyOwner {
        if (revenue == 0) revert ZeroRevenue();
        if (!_isSupported(chainSelector)) revert InvalidChainSelector(chainSelector);

        _recordCrossChainRevenue(agentId, chainSelector, revenue);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// @notice Get aggregated cross-chain total revenue for an agent
    /// @param agentId The agent's NFT ID
    /// @return total Aggregated revenue across all chains in USDC (6 decimals)
    function getCrossChainTotal(uint256 agentId) external view returns (uint256 total) {
        return crossChainTotals[agentId];
    }

    /// @notice Get revenue breakdown for an agent on a specific chain
    /// @param agentId The agent's NFT ID
    /// @param chainSelector The chain selector to query
    /// @return revenue The ChainRevenue struct for that agent/chain pair
    function getChainRevenue(uint256 agentId, uint64 chainSelector)
        external
        view
        returns (ChainRevenue memory revenue)
    {
        return agentChainRevenue[agentId][chainSelector];
    }

    /// @notice Get full revenue breakdown across all supported chains
    /// @param agentId The agent's NFT ID
    /// @return selectors Array of chain selectors
    /// @return revenues Array of corresponding ChainRevenue structs
    function getFullBreakdown(uint256 agentId)
        external
        view
        returns (uint64[] memory selectors, ChainRevenue[] memory revenues)
    {
        uint256 len = supportedChains.length;
        selectors = new uint64[](len);
        revenues = new ChainRevenue[](len);

        for (uint256 i = 0; i < len; i++) {
            selectors[i] = supportedChains[i];
            revenues[i] = agentChainRevenue[agentId][supportedChains[i]];
        }
    }

    /// @notice Get the number of supported chains
    function supportedChainCount() external view returns (uint256) {
        return supportedChains.length;
    }

    // -----------------------------------------------------------------------
    // CCIP message encoding helper (for sending from other chains)
    // -----------------------------------------------------------------------

    /// @notice Encode a revenue report payload for CCIP sending
    /// @param agentId The agent's NFT ID
    /// @param revenue Revenue amount in USDC (6 decimals)
    /// @return data ABI-encoded payload
    function encodeRevenueReport(uint256 agentId, uint256 revenue) external pure returns (bytes memory data) {
        return abi.encode(agentId, revenue);
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    function _recordCrossChainRevenue(uint256 agentId, uint64 chainSelector, uint256 revenue) internal {
        ChainRevenue storage data = agentChainRevenue[agentId][chainSelector];
        data.totalRevenue += revenue;
        data.lastUpdated = block.timestamp;
        data.active = true;

        // Recalculate total
        crossChainTotals[agentId] = _calculateTotal(agentId);

        emit CrossChainRevenueRecorded(agentId, chainSelector, revenue, crossChainTotals[agentId]);
    }

    function _calculateTotal(uint256 agentId) internal view returns (uint256 total) {
        uint256 len = supportedChains.length;
        for (uint256 i = 0; i < len; i++) {
            total += agentChainRevenue[agentId][supportedChains[i]].totalRevenue;
        }
    }

    function _getLocalChainSelector() internal view returns (uint64) {
        uint256 chainId = block.chainid;

        if (chainId == 8453) return CHAIN_SELECTOR_BASE;
        if (chainId == 42161) return CHAIN_SELECTOR_ARBITRUM;
        if (chainId == 10) return CHAIN_SELECTOR_OPTIMISM;
        if (chainId == 137) return CHAIN_SELECTOR_POLYGON;

        // Fallback for testnets / local: use Base selector
        return CHAIN_SELECTOR_BASE;
    }

    function _isSupported(uint64 selector) internal view returns (bool) {
        uint256 len = supportedChains.length;
        for (uint256 i = 0; i < len; i++) {
            if (supportedChains[i] == selector) return true;
        }
        return false;
    }
}
