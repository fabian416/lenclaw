// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TrancheMarket - Secondary market order book for tranche share listings
/// @notice Allows holders of sUSDC (Senior) or jUSDC (Junior) tranche shares to
///         list them for sale at a fixed USDC price. Buyers pay USDC; sellers receive
///         USDC minus a protocol fee. Supports both Senior and Junior tranche shares.
contract TrancheMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------
    // Types
    // ----------------------------------------------------------------

    enum TrancheType {
        Senior,
        Junior
    }

    enum ListingStatus {
        Active,
        Sold,
        Cancelled
    }

    struct Listing {
        uint256 id;
        address seller;
        TrancheType tranche;
        uint256 shares;       // amount of tranche shares for sale
        uint256 pricePerShare; // USDC per share (6 decimals)
        ListingStatus status;
        uint256 createdAt;
    }

    // ----------------------------------------------------------------
    // State
    // ----------------------------------------------------------------

    IERC20 public immutable usdc;
    IERC20 public immutable seniorTranche;
    IERC20 public immutable juniorTranche;

    uint256 public protocolFeeBps = 100; // 1% default protocol fee
    uint256 public constant MAX_FEE_BPS = 1000; // 10% hard cap

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;
    uint256 public accumulatedFees;

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        TrancheType tranche,
        uint256 shares,
        uint256 pricePerShare
    );

    event Delisted(uint256 indexed listingId, address indexed seller);

    event Bought(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 shares,
        uint256 totalPrice,
        uint256 fee
    );

    event FeesCollected(address indexed to, uint256 amount);
    event ProtocolFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    // ----------------------------------------------------------------
    // Errors
    // ----------------------------------------------------------------

    error InvalidShares();
    error InvalidPrice();
    error ListingNotActive();
    error NotSeller();
    error FeeTooHigh();

    // ----------------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------------

    constructor(
        address _usdc,
        address _seniorTranche,
        address _juniorTranche,
        address _owner
    ) Ownable(_owner) {
        usdc = IERC20(_usdc);
        seniorTranche = IERC20(_seniorTranche);
        juniorTranche = IERC20(_juniorTranche);
    }

    // ----------------------------------------------------------------
    // Admin
    // ----------------------------------------------------------------

    /// @notice Update protocol fee (in basis points). Max 10%.
    function setProtocolFeeBps(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit ProtocolFeeUpdated(protocolFeeBps, _feeBps);
        protocolFeeBps = _feeBps;
    }

    /// @notice Collect accumulated protocol fees to `to`.
    function collectFees(address to) external onlyOwner {
        uint256 fees = accumulatedFees;
        require(fees > 0, "TrancheMarket: no fees");
        accumulatedFees = 0;
        usdc.safeTransfer(to, fees);
        emit FeesCollected(to, fees);
    }

    // ----------------------------------------------------------------
    // Listing
    // ----------------------------------------------------------------

    /// @notice List tranche shares for sale at a fixed USDC price per share.
    ///         Caller must have approved this contract to transfer shares.
    /// @param tranche Senior (0) or Junior (1)
    /// @param shares  Amount of tranche share tokens to sell
    /// @param pricePerShare USDC price per share (6 decimals)
    /// @return listingId The ID of the newly created listing
    function list(
        TrancheType tranche,
        uint256 shares,
        uint256 pricePerShare
    ) external nonReentrant returns (uint256 listingId) {
        if (shares == 0) revert InvalidShares();
        if (pricePerShare == 0) revert InvalidPrice();

        // Transfer shares from seller to this contract (escrow)
        IERC20 shareToken = _trancheToken(tranche);
        shareToken.safeTransferFrom(msg.sender, address(this), shares);

        listingId = nextListingId++;
        listings[listingId] = Listing({
            id: listingId,
            seller: msg.sender,
            tranche: tranche,
            shares: shares,
            pricePerShare: pricePerShare,
            status: ListingStatus.Active,
            createdAt: block.timestamp
        });

        emit Listed(listingId, msg.sender, tranche, shares, pricePerShare);
    }

    /// @notice Cancel an active listing and return escrowed shares to the seller.
    function delist(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.Active) revert ListingNotActive();
        if (l.seller != msg.sender) revert NotSeller();

        l.status = ListingStatus.Cancelled;

        IERC20 shareToken = _trancheToken(l.tranche);
        shareToken.safeTransfer(msg.sender, l.shares);

        emit Delisted(listingId, msg.sender);
    }

    /// @notice Buy an active listing. Buyer pays USDC; seller receives USDC minus fee.
    ///         Buyer receives the escrowed tranche shares.
    function buy(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.Active) revert ListingNotActive();

        l.status = ListingStatus.Sold;

        uint256 totalPrice = l.shares * l.pricePerShare / 1e18;
        // If shares use 18 decimals and pricePerShare uses 6 decimals,
        // we need: totalCost = shares * pricePerShare / 1e18
        // But tranche shares from ERC-4626 with USDC (6 dec) underlying
        // also use 6 decimals by default in OZ ERC-4626.
        // So: totalCost = shares * pricePerShare / 10^shareDecimals
        // For simplicity we use raw multiplication (both 6 dec):
        // totalCost (6 dec USDC) = shares (6 dec) * pricePerShare (6 dec) / 1e6
        totalPrice = (l.shares * l.pricePerShare) / 1e6;

        uint256 fee = (totalPrice * protocolFeeBps) / 10000;
        uint256 sellerProceeds = totalPrice - fee;

        // Transfer USDC from buyer
        usdc.safeTransferFrom(msg.sender, address(this), totalPrice);

        // Pay seller
        usdc.safeTransfer(l.seller, sellerProceeds);
        accumulatedFees += fee;

        // Transfer escrowed shares to buyer
        IERC20 shareToken = _trancheToken(l.tranche);
        shareToken.safeTransfer(msg.sender, l.shares);

        emit Bought(listingId, msg.sender, l.seller, l.shares, totalPrice, fee);
    }

    // ----------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------

    /// @notice Return a listing by ID.
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    /// @notice Return a page of active listing IDs.
    ///         Gas-intensive view; meant for off-chain indexers.
    function getActiveListings(uint256 offset, uint256 limit)
        external
        view
        returns (Listing[] memory result, uint256 total)
    {
        // Count active listings first
        uint256 count;
        for (uint256 i = 1; i < nextListingId; i++) {
            if (listings[i].status == ListingStatus.Active) count++;
        }
        total = count;

        if (offset >= count) {
            return (new Listing[](0), total);
        }

        uint256 end = offset + limit;
        if (end > count) end = count;
        uint256 size = end - offset;

        result = new Listing[](size);
        uint256 found;
        uint256 idx;
        for (uint256 i = 1; i < nextListingId && idx < size; i++) {
            if (listings[i].status == ListingStatus.Active) {
                if (found >= offset) {
                    result[idx] = listings[i];
                    idx++;
                }
                found++;
            }
        }
    }

    /// @notice Get all active listings for a specific seller.
    function getSellerListings(address seller)
        external
        view
        returns (Listing[] memory result)
    {
        uint256 count;
        for (uint256 i = 1; i < nextListingId; i++) {
            if (listings[i].seller == seller && listings[i].status == ListingStatus.Active) {
                count++;
            }
        }

        result = new Listing[](count);
        uint256 idx;
        for (uint256 i = 1; i < nextListingId && idx < count; i++) {
            if (listings[i].seller == seller && listings[i].status == ListingStatus.Active) {
                result[idx] = listings[i];
                idx++;
            }
        }
    }

    // ----------------------------------------------------------------
    // Internal
    // ----------------------------------------------------------------

    function _trancheToken(TrancheType tranche) internal view returns (IERC20) {
        return tranche == TrancheType.Senior ? seniorTranche : juniorTranche;
    }
}
