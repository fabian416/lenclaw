// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SeniorTranche} from "../src/SeniorTranche.sol";
import {JuniorTranche} from "../src/JuniorTranche.sol";
import {LenclawVault} from "../src/LenclawVault.sol";
import {TrancheMarket} from "../src/TrancheMarket.sol";
import {TrancheRouter} from "../src/TrancheRouter.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MarketTest is Test {
    MockUSDC usdc;
    LenclawVault vault;
    SeniorTranche senior;
    JuniorTranche junior;
    TrancheMarket market;
    TrancheRouter router;

    address owner = address(this);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 constant INITIAL_BALANCE = 100_000e6;

    function setUp() public {
        // Deploy core contracts
        usdc = new MockUSDC();
        vault = new LenclawVault(IERC20(address(usdc)), owner);
        senior = new SeniorTranche(IERC20(address(usdc)), address(vault), owner);
        junior = new JuniorTranche(IERC20(address(usdc)), address(vault), owner);

        // Deploy market contracts
        market = new TrancheMarket(
            address(usdc),
            address(senior),
            address(junior),
            owner
        );
        router = new TrancheRouter(
            address(market),
            address(usdc),
            address(senior),
            address(junior)
        );

        // Fund test accounts
        usdc.mint(alice, INITIAL_BALANCE);
        usdc.mint(bob, INITIAL_BALANCE);
        usdc.mint(carol, INITIAL_BALANCE);
    }

    // ----------------------------------------------------------------
    // Helper: alice deposits into senior and gets shares
    // ----------------------------------------------------------------

    function _aliceDepositSenior(uint256 amount) internal returns (uint256 shares) {
        vm.startPrank(alice);
        usdc.approve(address(senior), amount);
        shares = senior.deposit(amount, alice);
        vm.stopPrank();
    }

    function _aliceDepositJunior(uint256 amount) internal returns (uint256 shares) {
        vm.startPrank(alice);
        usdc.approve(address(junior), amount);
        shares = junior.deposit(amount, alice);
        vm.stopPrank();
    }

    // ================================================================
    //                     TrancheMarket Tests
    // ================================================================

    function test_listSeniorShares() public {
        uint256 shares = _aliceDepositSenior(10_000e6);

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Senior,
            shares,
            1_040000 // $1.04 per share
        );
        vm.stopPrank();

        assertEq(listingId, 1, "First listing should have ID 1");

        TrancheMarket.Listing memory l = market.getListing(listingId);
        assertEq(l.seller, alice, "Seller should be alice");
        assertEq(l.shares, shares, "Shares mismatch");
        assertEq(l.pricePerShare, 1_040000, "Price mismatch");
        assertEq(uint8(l.status), uint8(TrancheMarket.ListingStatus.Active), "Should be active");

        // Shares should be escrowed in the market
        assertEq(senior.balanceOf(alice), 0, "Alice should have 0 shares after listing");
        assertEq(senior.balanceOf(address(market)), shares, "Market should hold shares");
    }

    function test_listJuniorShares() public {
        uint256 shares = _aliceDepositJunior(5_000e6);

        vm.startPrank(alice);
        junior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Junior,
            shares,
            1_120000 // $1.12 per share
        );
        vm.stopPrank();

        TrancheMarket.Listing memory l = market.getListing(listingId);
        assertEq(uint8(l.tranche), uint8(TrancheMarket.TrancheType.Junior));
        assertEq(junior.balanceOf(address(market)), shares);
    }

    function test_delistReturnsShares() public {
        uint256 shares = _aliceDepositSenior(10_000e6);

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Senior,
            shares,
            1_040000
        );

        // Delist
        market.delist(listingId);
        vm.stopPrank();

        // Shares should be returned to alice
        assertEq(senior.balanceOf(alice), shares, "Shares should be returned");
        assertEq(senior.balanceOf(address(market)), 0, "Market should have 0 shares");

        // Listing should be cancelled
        TrancheMarket.Listing memory l = market.getListing(listingId);
        assertEq(uint8(l.status), uint8(TrancheMarket.ListingStatus.Cancelled));
    }

    function test_delistRevert_notSeller() public {
        uint256 shares = _aliceDepositSenior(10_000e6);

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Senior,
            shares,
            1_040000
        );
        vm.stopPrank();

        // Bob tries to delist alice's listing
        vm.prank(bob);
        vm.expectRevert(TrancheMarket.NotSeller.selector);
        market.delist(listingId);
    }

    function test_buyListing() public {
        uint256 shares = _aliceDepositSenior(10_000e6);
        uint256 pricePerShare = 1_040000; // $1.04

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Senior,
            shares,
            pricePerShare
        );
        vm.stopPrank();

        // Calculate expected total price: shares * pricePerShare / 1e6
        uint256 totalPrice = (shares * pricePerShare) / 1e6;
        uint256 fee = (totalPrice * 100) / 10000; // 1% fee
        uint256 sellerProceeds = totalPrice - fee;

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        uint256 bobUsdcBefore = usdc.balanceOf(bob);

        // Bob buys the listing
        vm.startPrank(bob);
        usdc.approve(address(market), totalPrice);
        market.buy(listingId);
        vm.stopPrank();

        // Bob should receive the shares
        assertEq(senior.balanceOf(bob), shares, "Bob should have the shares");

        // Alice should receive USDC minus fee
        assertEq(
            usdc.balanceOf(alice),
            aliceUsdcBefore + sellerProceeds,
            "Alice should receive proceeds"
        );

        // Bob paid totalPrice in USDC
        assertEq(
            usdc.balanceOf(bob),
            bobUsdcBefore - totalPrice,
            "Bob should have paid total price"
        );

        // Protocol fee accumulated
        assertEq(market.accumulatedFees(), fee, "Fees should be accumulated");

        // Listing should be sold
        TrancheMarket.Listing memory l = market.getListing(listingId);
        assertEq(uint8(l.status), uint8(TrancheMarket.ListingStatus.Sold));
    }

    function test_buyRevert_listingNotActive() public {
        // Try to buy non-existent listing
        vm.prank(bob);
        vm.expectRevert(TrancheMarket.ListingNotActive.selector);
        market.buy(999);
    }

    function test_buyRevert_alreadySold() public {
        uint256 shares = _aliceDepositSenior(10_000e6);
        uint256 pricePerShare = 1_040000;

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Senior,
            shares,
            pricePerShare
        );
        vm.stopPrank();

        uint256 totalPrice = (shares * pricePerShare) / 1e6;

        // Bob buys
        vm.startPrank(bob);
        usdc.approve(address(market), totalPrice);
        market.buy(listingId);
        vm.stopPrank();

        // Carol tries to buy the same listing
        vm.startPrank(carol);
        usdc.approve(address(market), totalPrice);
        vm.expectRevert(TrancheMarket.ListingNotActive.selector);
        market.buy(listingId);
        vm.stopPrank();
    }

    function test_listRevert_zeroShares() public {
        vm.prank(alice);
        vm.expectRevert(TrancheMarket.InvalidShares.selector);
        market.list(TrancheMarket.TrancheType.Senior, 0, 1_000000);
    }

    function test_listRevert_zeroPrice() public {
        vm.prank(alice);
        vm.expectRevert(TrancheMarket.InvalidPrice.selector);
        market.list(TrancheMarket.TrancheType.Senior, 1000e6, 0);
    }

    function test_collectFees() public {
        uint256 shares = _aliceDepositSenior(10_000e6);
        uint256 pricePerShare = 1_000000; // $1.00

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Senior,
            shares,
            pricePerShare
        );
        vm.stopPrank();

        uint256 totalPrice = (shares * pricePerShare) / 1e6;

        vm.startPrank(bob);
        usdc.approve(address(market), totalPrice);
        market.buy(listingId);
        vm.stopPrank();

        uint256 expectedFee = (totalPrice * 100) / 10000;
        assertEq(market.accumulatedFees(), expectedFee);

        // Owner collects fees
        uint256 ownerBefore = usdc.balanceOf(owner);
        market.collectFees(owner);
        assertEq(usdc.balanceOf(owner), ownerBefore + expectedFee);
        assertEq(market.accumulatedFees(), 0);
    }

    function test_setProtocolFee() public {
        market.setProtocolFeeBps(500); // 5%
        assertEq(market.protocolFeeBps(), 500);
    }

    function test_setProtocolFeeRevert_tooHigh() public {
        vm.expectRevert(TrancheMarket.FeeTooHigh.selector);
        market.setProtocolFeeBps(1001);
    }

    function test_getActiveListings() public {
        // Create multiple listings
        uint256 shares1 = _aliceDepositSenior(5_000e6);

        vm.startPrank(alice);
        senior.approve(address(market), shares1);
        market.list(TrancheMarket.TrancheType.Senior, shares1, 1_040000);
        vm.stopPrank();

        // Bob deposits and lists
        vm.startPrank(bob);
        usdc.approve(address(senior), 3_000e6);
        uint256 shares2 = senior.deposit(3_000e6, bob);
        senior.approve(address(market), shares2);
        market.list(TrancheMarket.TrancheType.Senior, shares2, 1_050000);
        vm.stopPrank();

        (TrancheMarket.Listing[] memory active, uint256 total) = market.getActiveListings(0, 10);
        assertEq(total, 2, "Should have 2 active listings");
        assertEq(active.length, 2, "Should return 2 listings");
    }

    function test_getSellerListings() public {
        uint256 shares = _aliceDepositSenior(10_000e6);

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        market.list(TrancheMarket.TrancheType.Senior, shares / 2, 1_040000);
        market.list(TrancheMarket.TrancheType.Senior, shares / 2, 1_050000);
        vm.stopPrank();

        TrancheMarket.Listing[] memory aliceListings = market.getSellerListings(alice);
        assertEq(aliceListings.length, 2, "Alice should have 2 listings");

        TrancheMarket.Listing[] memory bobListings = market.getSellerListings(bob);
        assertEq(bobListings.length, 0, "Bob should have 0 listings");
    }

    // ================================================================
    //                     TrancheRouter Tests
    // ================================================================

    function test_depositAndList() public {
        uint256 depositAmount = 10_000e6;
        uint256 pricePerShare = 1_050000;

        vm.startPrank(alice);
        // Alice approves router to pull USDC
        usdc.approve(address(router), depositAmount);
        // Alice approves router to pull tranche shares back from her
        senior.approve(address(router), type(uint256).max);

        (uint256 listingId, uint256 shares) = router.depositAndList(
            TrancheMarket.TrancheType.Senior,
            depositAmount,
            pricePerShare
        );
        vm.stopPrank();

        assertGt(shares, 0, "Should receive shares");
        assertGt(listingId, 0, "Should get a listing ID");

        // The listing seller is the router (technical), but true owner is alice
        TrancheMarket.Listing memory l = market.getListing(listingId);
        assertEq(l.seller, address(router), "Listing seller is the router");
        assertEq(router.listingOwner(listingId), alice, "True owner should be alice");

        // Shares are held in the market (escrowed)
        assertEq(senior.balanceOf(address(market)), shares);
    }

    function test_depositAndList_makerOwnershipFix() public {
        uint256 depositAmount = 5_000e6;
        uint256 pricePerShare = 1_030000;

        vm.startPrank(alice);
        usdc.approve(address(router), depositAmount);
        senior.approve(address(router), type(uint256).max);

        (uint256 listingId,) = router.depositAndList(
            TrancheMarket.TrancheType.Senior,
            depositAmount,
            pricePerShare
        );
        vm.stopPrank();

        // Verify the maker ownership fix: alice is the true owner
        assertEq(router.listingOwner(listingId), alice, "Alice should be the true owner");

        // Alice can delist via the router
        vm.prank(alice);
        router.delistForOwner(listingId);

        // Shares should be returned to alice, NOT the router
        assertGt(senior.balanceOf(alice), 0, "Alice should have her shares back");
        assertEq(senior.balanceOf(address(router)), 0, "Router should have 0 shares");
    }

    function test_delistForOwner_revert_notOwner() public {
        uint256 depositAmount = 5_000e6;

        vm.startPrank(alice);
        usdc.approve(address(router), depositAmount);
        senior.approve(address(router), type(uint256).max);

        (uint256 listingId,) = router.depositAndList(
            TrancheMarket.TrancheType.Senior,
            depositAmount,
            1_030000
        );
        vm.stopPrank();

        // Bob tries to delist alice's listing through the router
        vm.prank(bob);
        vm.expectRevert("TrancheRouter: not listing owner");
        router.delistForOwner(listingId);
    }

    function test_buyAndWithdraw() public {
        // Alice lists senior shares
        uint256 shares = _aliceDepositSenior(10_000e6);
        uint256 pricePerShare = 1_000000; // $1.00 (at par)

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Senior,
            shares,
            pricePerShare
        );
        vm.stopPrank();

        uint256 totalPrice = (shares * pricePerShare) / 1e6;

        // Bob uses router to buy and immediately withdraw
        uint256 bobUsdcBefore = usdc.balanceOf(bob);

        vm.startPrank(bob);
        usdc.approve(address(router), totalPrice);
        uint256 assets = router.buyAndWithdraw(listingId);
        vm.stopPrank();

        assertGt(assets, 0, "Bob should receive USDC");
        // Bob spent totalPrice and received assets back
        uint256 bobUsdcAfter = usdc.balanceOf(bob);
        // Since we bought at par and redeemed (no interest accrued), we should get
        // approximately the deposit amount back, but paid totalPrice to the seller
        assertEq(bobUsdcAfter, bobUsdcBefore - totalPrice + assets, "USDC accounting");

        // Bob should have 0 tranche shares (all redeemed)
        assertEq(senior.balanceOf(bob), 0, "Bob should have 0 shares");
        assertEq(senior.balanceOf(address(router)), 0, "Router should have 0 shares");
    }

    function test_depositAndList_revert_zeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TrancheRouter.ZeroAmount.selector);
        router.depositAndList(TrancheMarket.TrancheType.Senior, 0, 1_000000);
    }

    // ================================================================
    //                     Edge Cases
    // ================================================================

    function test_multipleListingsDifferentTranches() public {
        // Alice lists senior
        uint256 seniorShares = _aliceDepositSenior(5_000e6);
        vm.startPrank(alice);
        senior.approve(address(market), seniorShares);
        uint256 listing1 = market.list(
            TrancheMarket.TrancheType.Senior,
            seniorShares,
            1_040000
        );
        vm.stopPrank();

        // Alice also deposits junior
        uint256 juniorShares = _aliceDepositJunior(3_000e6);
        vm.startPrank(alice);
        junior.approve(address(market), juniorShares);
        uint256 listing2 = market.list(
            TrancheMarket.TrancheType.Junior,
            juniorShares,
            1_120000
        );
        vm.stopPrank();

        assertEq(listing1, 1);
        assertEq(listing2, 2);

        TrancheMarket.Listing memory l1 = market.getListing(listing1);
        TrancheMarket.Listing memory l2 = market.getListing(listing2);
        assertEq(uint8(l1.tranche), uint8(TrancheMarket.TrancheType.Senior));
        assertEq(uint8(l2.tranche), uint8(TrancheMarket.TrancheType.Junior));
    }

    function test_delistAfterPartialSale_notPossible() public {
        // In our design, buy() purchases the entire listing, not partial.
        // Once sold, delist should revert.
        uint256 shares = _aliceDepositSenior(10_000e6);

        vm.startPrank(alice);
        senior.approve(address(market), shares);
        uint256 listingId = market.list(
            TrancheMarket.TrancheType.Senior,
            shares,
            1_000000
        );
        vm.stopPrank();

        uint256 totalPrice = (shares * 1_000000) / 1e6;

        vm.startPrank(bob);
        usdc.approve(address(market), totalPrice);
        market.buy(listingId);
        vm.stopPrank();

        // Alice tries to delist a sold listing
        vm.prank(alice);
        vm.expectRevert(TrancheMarket.ListingNotActive.selector);
        market.delist(listingId);
    }

    function test_listingPagination() public {
        // Create 3 listings
        for (uint256 i = 0; i < 3; i++) {
            usdc.mint(alice, 1_000e6);
            vm.startPrank(alice);
            usdc.approve(address(senior), 1_000e6);
            uint256 s = senior.deposit(1_000e6, alice);
            senior.approve(address(market), s);
            market.list(TrancheMarket.TrancheType.Senior, s, 1_000000);
            vm.stopPrank();
        }

        // Get first page (2 items)
        (TrancheMarket.Listing[] memory page1, uint256 total1) = market.getActiveListings(0, 2);
        assertEq(total1, 3);
        assertEq(page1.length, 2);

        // Get second page
        (TrancheMarket.Listing[] memory page2, uint256 total2) = market.getActiveListings(2, 2);
        assertEq(total2, 3);
        assertEq(page2.length, 1);
    }
}
