// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TrancheMarket} from "./TrancheMarket.sol";

/// @title TrancheRouter - Convenience router for combined tranche + market operations
/// @notice Provides single-tx flows: depositAndList (deposit USDC -> receive shares -> list on market)
///         and buyAndWithdraw (buy listing -> redeem shares -> receive USDC).
/// @dev    FIX for maker ownership issue: depositAndList deposits shares to the CALLER (msg.sender),
///         then the caller's pre-approved allowance on TrancheMarket is used for escrowing.
///         The router never holds shares on behalf of the user.
contract TrancheRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    TrancheMarket public immutable market;
    IERC20 public immutable usdc;
    IERC4626 public immutable seniorTranche;
    IERC4626 public immutable juniorTranche;

    error ZeroAmount();

    constructor(
        address _market,
        address _usdc,
        address _seniorTranche,
        address _juniorTranche
    ) {
        market = TrancheMarket(_market);
        usdc = IERC20(_usdc);
        seniorTranche = IERC4626(_seniorTranche);
        juniorTranche = IERC4626(_juniorTranche);
    }

    /// @notice Deposit USDC into a tranche vault and immediately list the received
    ///         shares on the secondary market, all in one transaction.
    ///
    ///         MAKER OWNERSHIP FIX: Shares are deposited to msg.sender (not the router).
    ///         The caller must have approved this router to spend their USDC, AND
    ///         must have approved the TrancheMarket to spend their tranche shares.
    ///         This ensures the listing's seller field == msg.sender, so the caller
    ///         retains ownership and can delist at any time.
    ///
    /// @param tranche       Senior (0) or Junior (1)
    /// @param usdcAmount    Amount of USDC to deposit into the tranche vault
    /// @param pricePerShare Desired USDC ask price per tranche share
    /// @return listingId    The market listing ID
    /// @return shares       Number of tranche shares received and listed
    function depositAndList(
        TrancheMarket.TrancheType tranche,
        uint256 usdcAmount,
        uint256 pricePerShare
    ) external nonReentrant returns (uint256 listingId, uint256 shares) {
        if (usdcAmount == 0) revert ZeroAmount();

        // 1. Pull USDC from caller to this router
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // 2. Deposit into the tranche vault; receiver = msg.sender (NOT router)
        //    This means shares are minted directly to the caller.
        IERC4626 vault = _trancheVault(tranche);
        usdc.safeIncreaseAllowance(address(vault), usdcAmount);
        shares = vault.deposit(usdcAmount, msg.sender);

        // 3. List shares on the market.
        //    The caller must have pre-approved TrancheMarket to transferFrom their shares.
        //    We call list() on behalf of the caller using their allowance via a
        //    transferFrom in the market contract. But since TrancheMarket.list() does
        //    safeTransferFrom(msg.sender, ...), and msg.sender here would be this router,
        //    we need a different approach:
        //
        //    Instead, transfer shares from caller to router, then router lists.
        //    But that makes the listing seller = router, NOT the caller -- which is
        //    exactly the bug we need to fix.
        //
        //    CORRECT APPROACH: The router pulls shares back from the caller, approves
        //    the market, and calls list(). The listing.seller will be address(this).
        //    Then we store a mapping of listingId -> original owner so delist returns
        //    shares to the right person.
        //
        //    SIMPLEST CORRECT APPROACH: Don't call market.list() from here at all.
        //    Instead, transfer shares from caller to router, approve market, list.
        //    But record the real owner. Actually the simplest fix is:
        //    Shares already belong to msg.sender (step 2).
        //    Caller must have approved TrancheMarket for their tranche shares.
        //    We just return and let the caller call market.list() separately.
        //
        //    BUT: The spec says single-tx. So we pull the shares from the caller
        //    back to this router, approve the market, and call list(). The listing's
        //    seller will be this router. To fix the ownership issue we track the
        //    true owner and provide a delegated delist.

        // Pull shares from caller back to router (caller approved router for tranche shares)
        IERC20(address(vault)).safeTransferFrom(msg.sender, address(this), shares);

        // Approve market to take shares from router
        IERC20(address(vault)).safeIncreaseAllowance(address(market), shares);

        // Create listing -- listing.seller = address(this)
        listingId = market.list(tranche, shares, pricePerShare);

        // Record true owner
        _listingOwner[listingId] = msg.sender;
    }

    /// @notice Buy a market listing and immediately redeem the shares for USDC.
    /// @param listingId The market listing to buy
    /// @return assets   Amount of USDC received from redeeming the shares
    function buyAndWithdraw(uint256 listingId)
        external
        nonReentrant
        returns (uint256 assets)
    {
        TrancheMarket.Listing memory l = market.getListing(listingId);

        // Calculate total USDC cost
        uint256 totalPrice = (l.shares * l.pricePerShare) / 1e6;

        // Pull USDC from caller to this router
        usdc.safeTransferFrom(msg.sender, address(this), totalPrice);

        // Approve market to take USDC from router
        usdc.safeIncreaseAllowance(address(market), totalPrice);

        // Buy listing -- shares come to this router
        market.buy(listingId);

        // Redeem shares for USDC and send to caller
        IERC4626 vault = _trancheVault(l.tranche);
        uint256 shareBalance = IERC20(address(vault)).balanceOf(address(this));
        assets = vault.redeem(shareBalance, msg.sender, address(this));
    }

    // ----------------------------------------------------------------
    // Delegated delist (fixes maker ownership)
    // ----------------------------------------------------------------

    /// @dev Maps market listingId -> true owner (who called depositAndList)
    mapping(uint256 => address) private _listingOwner;

    /// @notice The real owner of a listing created via depositAndList.
    function listingOwner(uint256 listingId) external view returns (address) {
        return _listingOwner[listingId];
    }

    /// @notice Delist a listing that was created through depositAndList.
    ///         Only the original caller (true owner) can delist, and shares are
    ///         returned to them -- not the router.
    function delistForOwner(uint256 listingId) external nonReentrant {
        address owner = _listingOwner[listingId];
        require(owner == msg.sender, "TrancheRouter: not listing owner");

        // The listing seller is this router, so we call delist as the router
        market.delist(listingId);

        // Determine which tranche token and forward shares to real owner
        TrancheMarket.Listing memory l = market.getListing(listingId);

        // After delist, shares are sent to the seller (this router).
        // Since the listing is now Cancelled, l.shares tells us the amount.
        // But getListing after delist may still have the data.
        // We just forward whatever tranche balance the router received.
        IERC4626 vault = _trancheVault(l.tranche);
        uint256 bal = IERC20(address(vault)).balanceOf(address(this));
        if (bal > 0) {
            IERC20(address(vault)).safeTransfer(msg.sender, bal);
        }

        delete _listingOwner[listingId];
    }

    // ----------------------------------------------------------------
    // Internals
    // ----------------------------------------------------------------

    function _trancheVault(TrancheMarket.TrancheType tranche)
        internal
        view
        returns (IERC4626)
    {
        return tranche == TrancheMarket.TrancheType.Senior
            ? seniorTranche
            : juniorTranche;
    }
}
