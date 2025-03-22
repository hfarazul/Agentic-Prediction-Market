// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {Market} from "../src/Market.sol";
import {Resolver} from "../src/Resolver.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract MarketTest is Test {
    Market public market;
    Resolver public resolver;
    PredictionMarket public predictionMarket;

    address public creator = address(1);
    address public agent = address(2);
    address public user1 = address(3);
    address public user2 = address(4);
    address public user3 = address(5);

    uint256 public constant INITIAL_BALANCE = 100 ether;
    uint256 public constant MIN_LIQUIDITY = 1e15;

    event MarketCreated(
        uint256 indexed marketId,
        address indexed market,
        string question,
        uint256 endTime
    );
    event SharesPurchased(
        address indexed trader,
        bool isYes,
        uint256 amount,
        uint256 cost
    );
    event MarketResolved(bool result);

    function setUp() public {
        // Setup accounts with initial balance
        vm.deal(creator, INITIAL_BALANCE);
        vm.deal(agent, INITIAL_BALANCE);
        vm.deal(user1, INITIAL_BALANCE);
        vm.deal(user2, INITIAL_BALANCE);
        vm.deal(user3, INITIAL_BALANCE);

        // Deploy contracts
        resolver = new Resolver(agent);
        predictionMarket = new PredictionMarket();
    }

    function testMarketCreation() public {
        string memory question = "Will ETH reach $5k in 2024?";
        uint256 endTime = block.timestamp + 7 days;
        string memory resolverUrl = "https://api.example.com/eth-price";

        vm.startPrank(creator);
        uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
            question,
            endTime,
            resolverUrl,
            address(resolver)
        );
        vm.stopPrank();

        address marketAddress = predictionMarket.getMarket(marketId);
        market = Market(payable(marketAddress));

        assertEq(market.question(), question);
        assertEq(market.endTime(), endTime);
        assertEq(market.resolverUrl(), resolverUrl);
        assertEq(market.resolverAddress(), address(resolver));
    }

    function testMarketInitialization() public {
        // Create market first
        string memory question = "Will ETH reach $5k in 2024?";
        uint256 endTime = block.timestamp + 7 days;

        vm.startPrank(creator);
        uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
            question,
            endTime,
            "https://api.example.com/eth-price",
            address(resolver)
        );
        vm.stopPrank();

        market = Market(payable(predictionMarket.getMarket(marketId)));

        // Test initialization
        vm.startPrank(user1);
        market.initializeMarket{value: 1 ether}();
        vm.stopPrank();

        (uint256 yesPrice, uint256 noPrice) = market.getCurrentPrices();
        assertEq(yesPrice, market.PRECISION() / 2); // Should be 50%
        assertEq(noPrice, market.PRECISION() / 2); // Should be 50%

        // Should not be able to initialize again
        vm.startPrank(user2);
        vm.expectRevert("Market already initialized");
        market.initializeMarket{value: 1 ether}();
        vm.stopPrank();
    }

    function testShareTrading() public {
        // Setup market
        setupInitializedMarket();

        // User1 buys YES shares
        vm.startPrank(user1);
        market.buyShares{value: 0.5 ether}(true);
        vm.stopPrank();

        // User2 buys NO shares
        vm.startPrank(user2);
        market.buyShares{value: 0.3 ether}(false);
        vm.stopPrank();

        // Check positions
        (uint256 user1Yes, uint256 user1No) = market.getPosition(user1);
        (uint256 user2Yes, uint256 user2No) = market.getPosition(user2);

        assertTrue(user1Yes > 0);
        assertEq(user1No, 0);
        assertEq(user2Yes, 0);
        assertTrue(user2No > 0);
    }

    function testShareSelling() public {
        setupInitializedMarket();

        // User1 buys then sells YES shares
        vm.startPrank(user1);
        market.buyShares{value: 0.5 ether}(true);
        (uint256 yesShares, ) = market.getPosition(user1);
        market.sellShares(true, yesShares);
        vm.stopPrank();

        // Check position is zero
        (uint256 finalYesShares, uint256 finalNoShares) = market.getPosition(
            user1
        );
        assertEq(finalYesShares, 0);
        assertEq(finalNoShares, 0);
    }

    function testMarketResolution() public {
        setupInitializedMarket();

        // Users buy shares
        vm.prank(user1);
        market.buyShares{value: 0.5 ether}(true);
        vm.prank(user2);
        market.buyShares{value: 0.3 ether}(false);

        // Advance time to end
        vm.warp(block.timestamp + 8 days);

        // Resolve market
        vm.startPrank(agent);
        resolver.resolveMarket(address(market), true); // YES wins
        vm.stopPrank();

        assertTrue(market.resolved());
        assertTrue(market.result()); // YES won

        // User1 (YES holder) claims winnings
        uint256 balanceBefore = user1.balance;
        vm.prank(user1);
        market.claimWinnings();
        assertTrue(user1.balance > balanceBefore);

        // User2 (NO holder) should not get winnings
        vm.expectRevert("No winnings to claim");
        vm.prank(user2);
        market.claimWinnings();
    }

    function testCannotTradeAfterResolution() public {
        setupInitializedMarket();

        // Advance time and resolve
        vm.warp(block.timestamp + 8 days);
        vm.prank(agent);
        resolver.resolveMarket(address(market), true);

        // Try to buy shares after resolution
        vm.expectRevert("Market ended");
        vm.prank(user1);
        market.buyShares{value: 0.1 ether}(true);

        // Try to sell shares after resolution
        vm.expectRevert("Market ended");
        vm.prank(user1);
        market.sellShares(true, 1e15);
    }

    function testCannotResolveBeforeEndTime() public {
        setupInitializedMarket();

        // Try to resolve before end time
        vm.prank(agent);
        vm.expectRevert("Market not ended");
        resolver.resolveMarket(address(market), true);
    }

    function testOnlyAgentCanResolve() public {
        setupInitializedMarket();
        vm.warp(block.timestamp + 8 days);

        // Try to resolve from non-agent address
        vm.prank(user1);
        vm.expectRevert("Only agent can resolve");
        resolver.resolveMarket(address(market), true);
    }

    function testFullMarketLifecycle() public {
        // 1. Market Creation
        string memory question = "Will ETH reach $5k in 2024?";
        uint256 endTime = block.timestamp + 7 days;
        string memory resolverUrl = "https://api.example.com/eth-price";

        vm.startPrank(creator);
        uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
            question,
            endTime,
            resolverUrl,
            address(resolver)
        );
        vm.stopPrank();

        market = Market(payable(predictionMarket.getMarket(marketId)));

        // 2. Market Initialization
        vm.startPrank(user1);
        market.initializeMarket{value: 1 ether}();
        vm.stopPrank();

        // Store initial prices
        (uint256 initialYesPrice, uint256 initialNoPrice) = market
            .getCurrentPrices();
        assertEq(initialYesPrice, market.PRECISION() / 2); // Should start at 50%
        assertEq(initialNoPrice, market.PRECISION() / 2);

        // 3. Multiple Trading Rounds
        // Round 1: User1 believes in YES
        vm.startPrank(user1);
        market.buyShares{value: 2 ether}(true);
        vm.stopPrank();

        // Check price movement after YES buy
        (uint256 yesPrice1, uint256 noPrice1) = market.getCurrentPrices();
        assertTrue(
            yesPrice1 > initialYesPrice,
            "Yes price should increase after yes buy"
        );
        assertTrue(
            noPrice1 < initialNoPrice,
            "No price should decrease after yes buy"
        );

        // Round 2: User2 believes in NO
        vm.startPrank(user2);
        market.buyShares{value: 1.5 ether}(false);
        vm.stopPrank();

        // Check price movement after NO buy
        (uint256 yesPrice2, uint256 noPrice2) = market.getCurrentPrices();
        assertTrue(
            yesPrice2 < yesPrice1,
            "Yes price should decrease after no buy"
        );
        assertTrue(
            noPrice2 > noPrice1,
            "No price should increase after no buy"
        );

        // Round 3: User3 joins YES side
        vm.startPrank(user3);
        market.buyShares{value: 1 ether}(true);
        vm.stopPrank();

        // 4. Some users take profits
        // User1 sells half their position
        vm.startPrank(user1);
        (uint256 user1Shares, ) = market.getPosition(user1);
        market.sellShares(true, user1Shares / 2);
        vm.stopPrank();

        // 5. Market Approaches End
        // Fast forward to near end time
        vm.warp(block.timestamp + 6 days);

        // Last minute trading
        vm.startPrank(user2);
        market.buyShares{value: 0.5 ether}(false);
        vm.stopPrank();

        // 6. Market Resolution
        // Move to end time
        vm.warp(endTime + 1);

        // Record balances before resolution
        uint256 user1BalanceBefore = user1.balance;
        uint256 user2BalanceBefore = user2.balance;
        uint256 user3BalanceBefore = user3.balance;

        // Agent resolves the market (YES wins)
        vm.prank(agent);
        resolver.resolveMarket(address(market), true);

        // 7. Winners Claim
        // User1 claims (YES holder)
        vm.prank(user1);
        market.claimWinnings();
        assertTrue(user1.balance > user1BalanceBefore, "User1 should profit");

        // User3 claims (YES holder)
        vm.prank(user3);
        market.claimWinnings();
        assertTrue(user3.balance > user3BalanceBefore, "User3 should profit");

        // 8. Verify Losers Can't Claim
        vm.expectRevert("No winnings to claim");
        vm.prank(user2);
        market.claimWinnings();
        assertEq(user2.balance, user2BalanceBefore, "User2 should not profit");

        // 9. Verify Market State
        assertTrue(market.resolved(), "Market should be resolved");
        assertTrue(market.result(), "Result should be YES");

        // 10. Verify No Further Trading
        vm.expectRevert("Market ended");
        vm.prank(user1);
        market.buyShares{value: 0.1 ether}(true);

        vm.expectRevert("Market ended");
        vm.prank(user2);
        market.sellShares(false, 1e15);
    }

    function testExtremeSingleSidedLiquidity() public {
        setupInitializedMarket();

        // First user buys a large amount of YES shares to create imbalance
        vm.startPrank(user1);
        market.buyShares{value: 5 ether}(true);
        vm.stopPrank();

        // Store the position and prices after large YES position
        (uint256 user1YesShares, ) = market.getPosition(user1);
        (uint256 yesPriceAfterBuy, uint256 noPriceAfterBuy) = market
            .getCurrentPrices();

        // Verify price impact - YES should be expensive, NO should be cheap
        assertTrue(
            yesPriceAfterBuy > (market.PRECISION() * 80) / 100,
            "Yes price should be very high (>80%)"
        );
        assertTrue(
            noPriceAfterBuy < (market.PRECISION() * 20) / 100,
            "No price should be very low (<20%)"
        );

        // Try to buy more YES shares - should be very expensive
        vm.startPrank(user2);
        uint256 user2BalanceBefore = user2.balance;
        market.buyShares{value: 0.1 ether}(true);
        uint256 user2BalanceAfter = user2.balance;
        vm.stopPrank();

        // Check that user2 got very few shares due to high price
        (uint256 user2YesShares, ) = market.getPosition(user2);
        assertTrue(
            user2YesShares < user1YesShares / 10,
            "User2 should get few shares due to high price"
        );
        assertTrue(
            (user2BalanceBefore - user2BalanceAfter) > 0.09 ether,
            "High slippage cost for buying YES in imbalanced pool"
        );

        // Try to buy NO shares - should get more shares but still pay significant cost due to CPMM
        vm.startPrank(user3);
        uint256 user3BalanceBefore = user3.balance;
        market.buyShares{value: 0.1 ether}(false);
        uint256 user3BalanceAfter = user3.balance;
        vm.stopPrank();

        // Check that user3 got more NO shares than user2's YES shares
        (, uint256 user3NoShares) = market.getPosition(user3);
        assertTrue(
            user3NoShares > user2YesShares,
            "User3 should get more NO shares than User2's YES shares"
        );

        // Even though NO price is low, CPMM ensures significant cost to maintain price relationship
        assertTrue(
            (user3BalanceBefore - user3BalanceAfter) > 0.05 ether,
            "Should still have significant cost for NO shares due to CPMM"
        );

        // Verify market can still be resolved correctly
        vm.warp(block.timestamp + 8 days);
        vm.prank(agent);
        resolver.resolveMarket(address(market), true);

        // YES winners should still be able to claim
        uint256 user1BalanceBefore = user1.balance;
        vm.prank(user1);
        market.claimWinnings();
        assertTrue(
            user1.balance > user1BalanceBefore,
            "User1 should profit from YES position"
        );

        // NO holders should not be able to claim
        vm.expectRevert("No winnings to claim");
        vm.prank(user3);
        market.claimWinnings();
    }

    // Helper function to setup a market with initial liquidity
    function setupInitializedMarket() internal {
        string memory question = "Will ETH reach $5k in 2024?";
        uint256 endTime = block.timestamp + 7 days;

        vm.prank(creator);
        uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
            question,
            endTime,
            "https://api.example.com/eth-price",
            address(resolver)
        );

        market = Market(payable(predictionMarket.getMarket(marketId)));

        vm.prank(user1);
        market.initializeMarket{value: 1 ether}();
    }
}
