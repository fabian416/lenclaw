// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DutchAuction - Dutch auction for defaulted AI agent credit positions
/// @notice Price starts high and decays linearly over a configurable duration.
///         Bidders purchase defaulted positions at the current price.
///         Proceeds are forwarded to the RecoveryManager for proportional distribution.
contract DutchAuction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum AuctionStatus {
        NONE,
        ACTIVE,
        SETTLED,
        EXPIRED
    }

    struct Auction {
        uint256 agentId;
        uint256 debtAmount;          // Total outstanding debt being auctioned
        uint256 startPrice;          // Starting price (high)
        uint256 minPrice;            // Floor price (minimum acceptable)
        uint256 startTime;           // Auction start timestamp
        uint256 duration;            // Auction duration in seconds
        uint256 settledPrice;        // Final settlement price (0 if unsettled)
        address buyer;               // Winning bidder
        AuctionStatus status;
    }

    IERC20 public immutable asset;
    address public recoveryManager;

    /// @notice Configurable auction parameters
    uint256 public startPriceMultiplierBps = 15000; // 150% of debt
    uint256 public defaultDuration = 6 hours;
    uint256 public minPriceBps = 3000;              // 30% of debt (floor)

    /// @notice Auction storage: auctionId => Auction
    mapping(uint256 => Auction) public auctions;
    uint256 public nextAuctionId = 1;

    /// @notice Track active auction per agent to prevent duplicates
    mapping(uint256 => uint256) public activeAuctionByAgent;

    // ── Events ──────────────────────────────────────────────────

    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed agentId,
        uint256 debtAmount,
        uint256 startPrice,
        uint256 minPrice,
        uint256 duration
    );
    event AuctionSettled(
        uint256 indexed auctionId,
        uint256 indexed agentId,
        address indexed buyer,
        uint256 settledPrice
    );
    event AuctionExpired(uint256 indexed auctionId, uint256 indexed agentId);
    event ParametersUpdated(uint256 startPriceMultiplierBps, uint256 defaultDuration, uint256 minPriceBps);
    event RecoveryManagerUpdated(address indexed recoveryManager);

    // ── Constructor ─────────────────────────────────────────────

    constructor(address _asset, address _recoveryManager, address _owner) Ownable(_owner) {
        require(_asset != address(0), "DutchAuction: zero asset");
        require(_recoveryManager != address(0), "DutchAuction: zero recovery manager");
        asset = IERC20(_asset);
        recoveryManager = _recoveryManager;
    }

    // ── Admin ───────────────────────────────────────────────────

    function setRecoveryManager(address _recoveryManager) external onlyOwner {
        require(_recoveryManager != address(0), "DutchAuction: zero address");
        recoveryManager = _recoveryManager;
        emit RecoveryManagerUpdated(_recoveryManager);
    }

    function setParameters(
        uint256 _startPriceMultiplierBps,
        uint256 _defaultDuration,
        uint256 _minPriceBps
    ) external onlyOwner {
        require(_startPriceMultiplierBps >= 10000, "DutchAuction: multiplier < 100%");
        require(_defaultDuration >= 1 hours, "DutchAuction: duration too short");
        require(_minPriceBps > 0 && _minPriceBps <= 10000, "DutchAuction: invalid min price");
        require(_minPriceBps <= _startPriceMultiplierBps, "DutchAuction: min > start price");

        startPriceMultiplierBps = _startPriceMultiplierBps;
        defaultDuration = _defaultDuration;
        minPriceBps = _minPriceBps;

        emit ParametersUpdated(_startPriceMultiplierBps, _defaultDuration, _minPriceBps);
    }

    // ── Auction Lifecycle ───────────────────────────────────────

    /// @notice Create a new Dutch auction for a defaulted credit position.
    ///         Only callable by the RecoveryManager or owner.
    /// @param agentId   The defaulted agent's ID
    /// @param debtAmount Total outstanding debt
    /// @return auctionId The newly created auction's ID
    function createAuction(uint256 agentId, uint256 debtAmount) external returns (uint256 auctionId) {
        require(
            msg.sender == recoveryManager || msg.sender == owner(),
            "DutchAuction: not authorized"
        );
        require(debtAmount > 0, "DutchAuction: zero debt");
        require(
            activeAuctionByAgent[agentId] == 0,
            "DutchAuction: auction already active for agent"
        );

        uint256 startPrice = (debtAmount * startPriceMultiplierBps) / 10000;
        uint256 minPrice = (debtAmount * minPriceBps) / 10000;

        auctionId = nextAuctionId++;

        auctions[auctionId] = Auction({
            agentId: agentId,
            debtAmount: debtAmount,
            startPrice: startPrice,
            minPrice: minPrice,
            startTime: block.timestamp,
            duration: defaultDuration,
            settledPrice: 0,
            buyer: address(0),
            status: AuctionStatus.ACTIVE
        });

        activeAuctionByAgent[agentId] = auctionId;

        emit AuctionCreated(auctionId, agentId, debtAmount, startPrice, minPrice, defaultDuration);
    }

    /// @notice Bid on an active auction at the current Dutch auction price.
    ///         The bidder pays the current price and the auction settles immediately.
    /// @param auctionId The auction to bid on
    /// @param maxPrice  Maximum price the bidder is willing to pay (MEV/front-running protection)
    function bid(uint256 auctionId, uint256 maxPrice) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.status == AuctionStatus.ACTIVE, "DutchAuction: not active");
        require(block.timestamp <= auction.startTime + auction.duration, "DutchAuction: expired");

        uint256 currentPrice = getCurrentPrice(auctionId);
        require(currentPrice > 0, "DutchAuction: price is zero");
        require(currentPrice <= maxPrice, "DutchAuction: price slipped");

        // Transfer USDC from bidder to this contract
        asset.safeTransferFrom(msg.sender, address(this), currentPrice);

        // Settle the auction
        auction.settledPrice = currentPrice;
        auction.buyer = msg.sender;
        auction.status = AuctionStatus.SETTLED;

        // Clear the active auction for this agent
        activeAuctionByAgent[auction.agentId] = 0;

        // Forward proceeds to the RecoveryManager
        asset.safeTransfer(recoveryManager, currentPrice);

        emit AuctionSettled(auctionId, auction.agentId, msg.sender, currentPrice);
    }

    /// @notice Mark an auction as expired if the duration has passed without a bid.
    ///         Callable by anyone.
    /// @param auctionId The auction to expire
    function markExpired(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];
        require(auction.status == AuctionStatus.ACTIVE, "DutchAuction: not active");
        require(
            block.timestamp > auction.startTime + auction.duration,
            "DutchAuction: not yet expired"
        );

        auction.status = AuctionStatus.EXPIRED;
        activeAuctionByAgent[auction.agentId] = 0;

        emit AuctionExpired(auctionId, auction.agentId);
    }

    // ── View Functions ──────────────────────────────────────────

    /// @notice Get the current Dutch auction price. Linearly decays from
    ///         startPrice to minPrice over the auction duration.
    /// @param auctionId The auction to query
    /// @return price Current price in USDC (6 decimals)
    function getCurrentPrice(uint256 auctionId) public view returns (uint256 price) {
        Auction memory auction = auctions[auctionId];
        if (auction.status != AuctionStatus.ACTIVE) return 0;

        uint256 elapsed = block.timestamp - auction.startTime;
        if (elapsed >= auction.duration) {
            return auction.minPrice;
        }

        // Linear decay: startPrice - (startPrice - minPrice) * elapsed / duration
        uint256 priceDrop = auction.startPrice - auction.minPrice;
        uint256 decay = (priceDrop * elapsed) / auction.duration;
        price = auction.startPrice - decay;
    }

    /// @notice Get full auction details
    /// @param auctionId The auction to query
    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    /// @notice Check if an agent has an active auction
    /// @param agentId The agent to check
    function hasActiveAuction(uint256 agentId) external view returns (bool) {
        return activeAuctionByAgent[agentId] != 0;
    }

    /// @notice Get the remaining time for an active auction
    /// @param auctionId The auction to query
    /// @return remaining Seconds remaining (0 if expired or not active)
    function getRemainingTime(uint256 auctionId) external view returns (uint256 remaining) {
        Auction memory auction = auctions[auctionId];
        if (auction.status != AuctionStatus.ACTIVE) return 0;

        uint256 endTime = auction.startTime + auction.duration;
        if (block.timestamp >= endTime) return 0;

        remaining = endTime - block.timestamp;
    }
}
