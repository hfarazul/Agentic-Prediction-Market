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
        string memory details = "Details about the market";
        string memory imageUrl = "https://api.example.com/image.png";
        string memory resolverUrl = "https://api.example.com/eth-price";

        vm.startPrank(creator);
        uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
            question,
            details,
            endTime,
            imageUrl,
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
        string memory details = "Details about the market";
        string memory imageUrl = "https://api.example.com/image.png";

        vm.startPrank(creator);
        uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
            question,
            details,
            endTime,
            imageUrl,
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
        string memory details = "Details about the market";
        string memory imageUrl = "https://api.example.com/image.png";

        vm.startPrank(creator);
        uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
            question,
            details,
            endTime,
            imageUrl,
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

    function testPriceManipulationResistance() public {
        setupInitializedMarket();

        // Record initial prices
        (uint256 initialYesPrice, uint256 initialNoPrice) = market
            .getCurrentPrices();

        // User1 attempts to manipulate price with a series of trades
        vm.startPrank(user1);

        // First large buy to move price
        market.buyShares{value: 3 ether}(true);
        (uint256 yesPrice1, ) = market.getCurrentPrices();
        assertTrue(
            yesPrice1 > initialYesPrice,
            "Price should increase after large buy"
        );

        // Partial sell to try to manipulate
        (uint256 yesShares, ) = market.getPosition(user1);
        market.sellShares(true, yesShares / 2);
        (uint256 yesPrice2, ) = market.getCurrentPrices();
        assertTrue(yesPrice2 < yesPrice1, "Price should decrease after sell");

        // Try to buy again at "lower" price
        market.buyShares{value: 1 ether}(true);
        vm.stopPrank();

        // Verify price stabilizes near original after multiple trades
        (uint256 finalYesPrice, uint256 finalNoPrice) = market
            .getCurrentPrices();
        assertTrue(
            abs(int256(finalYesPrice) - int256(initialYesPrice)) <
                (market.PRECISION() * 4) / 10,
            "Price should remain within reasonable bounds after manipulation attempts"
        );
    }

    function testMinimumLiquidityEdgeCases() public {
        setupInitializedMarket();

        // Try to buy very small amount of shares
        vm.startPrank(user1);
        vm.expectRevert("Amount too small");
        market.buyShares{value: 1000 wei}(true);

        // Buy minimum valid amount
        market.buyShares{value: MIN_LIQUIDITY}(true);
        (uint256 minShares, ) = market.getPosition(user1);
        assertTrue(minShares > 0, "Should get some shares for minimum amount");

        // Try to sell very small amount
        vm.expectRevert("Amount too small");
        market.sellShares(true, minShares / 100);

        // Sell all shares
        market.sellShares(true, minShares);
        (uint256 finalShares, ) = market.getPosition(user1);
        assertEq(finalShares, 0, "Should be able to sell all shares");
        vm.stopPrank();

        // Verify market still functions after min amount trades
        (uint256 yesPrice, uint256 noPrice) = market.getCurrentPrices();
        assertTrue(
            yesPrice > 0 && noPrice > 0,
            "Market should maintain valid prices"
        );
    }

    function testExtremePriceScenarios() public {
        setupInitializedMarket();

        // Try to push YES price very close to 100%
        vm.startPrank(user1);
        for (uint i = 0; i < 5; i++) {
            market.buyShares{value: 1 ether}(true);
            (uint256 yesPrice, uint256 noPrice) = market.getCurrentPrices();

            // Verify prices remain valid
            assertTrue(
                yesPrice <= market.PRECISION(),
                "YES price should not exceed 100%"
            );
            assertTrue(noPrice > 0, "NO price should never reach 0");
            assertTrue(
                yesPrice + noPrice == market.PRECISION(),
                "Prices should sum to PRECISION"
            );
        }
        vm.stopPrank();

        // Try to push NO price very close to 100%
        vm.startPrank(user2);
        for (uint i = 0; i < 5; i++) {
            market.buyShares{value: 1 ether}(false);
            (uint256 yesPrice, uint256 noPrice) = market.getCurrentPrices();

            // Verify prices remain valid
            assertTrue(
                noPrice <= market.PRECISION(),
                "NO price should not exceed 100%"
            );
            assertTrue(yesPrice > 0, "YES price should never reach 0");
            assertTrue(
                yesPrice + noPrice == market.PRECISION(),
                "Prices should sum to PRECISION"
            );
        }
        vm.stopPrank();

        // Verify market can still be resolved correctly at extreme prices
        vm.warp(block.timestamp + 8 days);
        vm.prank(agent);
        resolver.resolveMarket(address(market), true);

        // Both YES and NO holders should be able to claim based on their positions
        vm.prank(user1);
        market.claimWinnings();

        vm.expectRevert("No winnings to claim");
        vm.prank(user2);
        market.claimWinnings();
    }

    function testFlashLoanAttackScenario() public {
        setupInitializedMarket();

        // Simulate flash loan by giving user a large but reasonable balance
        vm.deal(user1, 100 ether);

        // Record initial state and balance
        uint256 initialBalance = user1.balance;
        (uint256 initialYesPrice, ) = market.getCurrentPrices();

        // Attempt sandwich attack:
        vm.startPrank(user1);

        // Step 1: Initial smaller buy to establish baseline
        market.buyShares{value: 1 ether}(true);

        // Step 2: Large buy to move price significantly
        market.buyShares{value: 3 ether}(true);
        (uint256 yesShares, ) = market.getPosition(user1);

        // Record intermediate price
        (uint256 peakPrice, ) = market.getCurrentPrices();
        assertTrue(
            peakPrice > initialYesPrice,
            "Price should increase after large buy"
        );

        // Step 3: Sell all shares quickly
        market.sellShares(true, yesShares);

        // Step 4: Wait a block to avoid high sandwich fees
        vm.roll(block.number + 1);

        // Step 5: Try another trade to test recovery
        market.buyShares{value: 1 ether}(true);
        (yesShares, ) = market.getPosition(user1);
        market.sellShares(true, yesShares);

        // Calculate total loss
        uint256 totalLoss = initialBalance - user1.balance;
        assertTrue(
            totalLoss > 0.1 ether,
            "Flash loan attack should result in significant loss due to fees and slippage"
        );

        // Get final price and verify recovery
        (uint256 finalYesPrice, ) = market.getCurrentPrices();

        // Check if price has moved back towards initial price
        uint256 priceDeviation = abs(
            int256(finalYesPrice) - int256(initialYesPrice)
        );
        assertTrue(
            priceDeviation < market.PRECISION() / 2,
            "Market should recover towards initial price after attack"
        );

        vm.stopPrank();
    }

    function testRoundingErrorsAndPrecision() public {
        setupInitializedMarket();

        // Test very small trades near precision limits
        vm.startPrank(user1);

        // First, add some liquidity to ensure enough depth
        market.buyShares{value: 1 ether}(true);

        // Now test minimum trade size
        uint256 minTradeSize = 1e13; // MIN_TRADE_SIZE = 0.00001 ether

        // Buy enough shares to ensure we can sell above minimum
        market.buyShares{value: minTradeSize * 10}(true);
        (uint256 initialShares, ) = market.getPosition(user1);
        assertTrue(
            initialShares >= minTradeSize,
            "Should receive sufficient shares for minimum trade"
        );

        // Try to sell exactly minimum trade size
        market.sellShares(true, minTradeSize);

        // Verify remaining position
        (uint256 finalShares, ) = market.getPosition(user1);
        assertTrue(
            finalShares > 0 && finalShares < initialShares,
            "Should have remaining shares after partial sell"
        );

        // Verify prices maintain precision
        (uint256 yesPrice, uint256 noPrice) = market.getCurrentPrices();
        assertEq(
            yesPrice + noPrice,
            market.PRECISION(),
            "Prices should sum to PRECISION even with small trades"
        );

        // Try to sell remaining shares
        market.sellShares(true, finalShares);

        // Verify position is cleared
        (uint256 endShares, ) = market.getPosition(user1);
        assertEq(endShares, 0, "Should be able to sell all remaining shares");

        vm.stopPrank();
    }

    function testMaximumLiquidityScenarios() public {
        setupInitializedMarket();

        // Add large but reasonable liquidity to test upper bounds
        vm.deal(user1, 1000 ether);
        vm.startPrank(user1);

        // Large YES position - using 100 ETH instead of 100,000
        market.buyShares{value: 100 ether}(true);

        // Record state after large liquidity
        (uint256 yesPrice1, uint256 noPrice1) = market.getCurrentPrices();
        assertTrue(
            yesPrice1 + noPrice1 == market.PRECISION(),
            "Prices should sum to PRECISION with large liquidity"
        );

        // Try small trade after large liquidity
        vm.startPrank(user2);
        market.buyShares{value: 0.1 ether}(false);

        // Verify small trades still possible
        (, uint256 noShares) = market.getPosition(user2);
        assertTrue(
            noShares > 0,
            "Should be able to make small trades with large liquidity"
        );

        // Verify price impact is small due to large liquidity
        (uint256 yesPrice2, uint256 noPrice2) = market.getCurrentPrices();
        assertTrue(
            abs(int256(yesPrice2) - int256(yesPrice1)) <
                market.PRECISION() / 100,
            "Large liquidity should minimize price impact"
        );
        vm.stopPrank();
    }

    // Helper function for absolute value
    function abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    // Helper function to setup a market with initial liquidity
    function setupInitializedMarket() internal {
        string memory question = "Will ETH reach $5k in 2024?";
        uint256 endTime = block.timestamp + 7 days;
        string memory details = "Details about the market";
        string memory imageUrl = "https://api.example.com/image.png";

        vm.prank(creator);
        uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
            question,
            details,
            endTime,
            imageUrl,
            address(resolver)
        );

        market = Market(payable(predictionMarket.getMarket(marketId)));

        vm.prank(user1);
        market.initializeMarket{value: 1 ether}();
    }
}
