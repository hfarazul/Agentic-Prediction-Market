// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Market is ReentrancyGuard {
    struct Position {
        uint256 yesShares;
        uint256 noShares;
    }

    string public question;
    string public details;
    string public imageUrl;
    uint256 public endTime;
    string public resolverUrl;
    address public resolverAddress;
    address public predictionMarket;

    bool public resolved;
    bool public result;
    bool public initialized;

    // Track user positions
    mapping(address => Position) public positions;

    // Market statistics
    uint256 public totalYesShares;
    uint256 public totalNoShares;
    uint256 public constant PRECISION = 1e18;
    uint256 public constant MIN_LIQUIDITY = 1e15; // Minimum liquidity required for initialization
    uint256 public constant MIN_TRADE_SIZE = 1e13; // 0.00001 ETH
    uint256 public constant MAX_UINT = type(uint256).max;
    uint256 public constant MIN_POOL_SIZE = 1e14; // 0.0001 ETH minimum pool size

    // CPMM variables
    uint256 public yesPool;
    uint256 public noPool;

    // Constants for fees and limits
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public constant BASE_FEE = 10; // 1.0% base fee

    // Dynamic fee parameters
    uint256 public constant DYNAMIC_FEE_NUMERATOR = 400; // 40% max dynamic fee
    uint256 public constant DYNAMIC_FEE_DENOMINATOR = 1000;
    uint256 public constant PRICE_IMPACT_FEE_NUMERATOR = 300; // 30% additional fee for price impact
    uint256 public constant SANDWICH_FEE_MULTIPLIER = 3; // Triple fees for same-block trades

    // State variables for fees and liquidity
    uint256 public accumulatedFees;
    uint256 public totalLiquidity;
    mapping(address => uint256) public lastTradeBlock; // Track last trade block for each user
    mapping(address => uint256) public lastTradePrice; // Track last trade price for each user

    // Events
    event SharesPurchased(
        address indexed trader,
        bool isYes,
        uint256 amount,
        uint256 cost
    );
    event SharesSold(
        address indexed trader,
        bool isYes,
        uint256 amount,
        uint256 received
    );
    event MarketResolved(bool result);
    event PriceUpdated(uint256 yesPrice, uint256 noPrice);
    event MarketInitialized(uint256 initialLiquidity);

    function initializeMarket() public payable nonReentrant {
        require(!initialized, "Market already initialized");
        require(msg.value >= MIN_LIQUIDITY, "Insufficient initial liquidity");
        require(block.timestamp < endTime, "Market ended");

        // Split initial liquidity equally between yes and no pools
        yesPool = msg.value / 2;
        noPool = msg.value / 2;
        initialized = true;

        emit MarketInitialized(msg.value);
        emit PriceUpdated(_getYesPrice(), _getNoPrice());
    }

    constructor(
        string memory _question,
        string memory _details,
        uint256 _endTime,
        string memory _imageUrl,
        string memory _resolverUrl,
        address _resolverAddress,
        address _predictionMarket
    ) payable {
        question = _question;
        details = _details;
        endTime = _endTime;
        imageUrl = _imageUrl;
        resolverUrl = _resolverUrl;
        resolverAddress = _resolverAddress;
        predictionMarket = _predictionMarket;

        initializeMarket();
    }

    function calculatePriceImpact(
        uint256 amount,
        uint256 poolSize
    ) internal pure returns (uint256) {
        if (poolSize == 0) return 0;
        // Calculate marginal price impact as percentage of final pool size
        uint256 newPoolSize = poolSize + amount;
        uint256 priceRatio = (poolSize * PRECISION) / newPoolSize;
        return PRECISION - priceRatio; // Impact is the price change percentage
    }

    function calculateDynamicFee(
        uint256 amount,
        uint256 poolSize
    ) internal pure returns (uint256) {
        // Base fee of 1%
        uint256 fee = (amount * BASE_FEE) / FEE_DENOMINATOR;

        // Add dynamic fee based on trade size relative to pool
        if (poolSize > 0) {
            // Calculate trade ratio as percentage of pool size
            uint256 tradeRatio = (amount * 100) / (poolSize + amount);
            // Additional fee scales with trade ratio, max 4%
            uint256 dynamicFee = (amount *
                DYNAMIC_FEE_NUMERATOR *
                tradeRatio *
                tradeRatio) / (DYNAMIC_FEE_DENOMINATOR * 1000 * 1000);
            fee += dynamicFee;

            // Cap total fee at 5%
            uint256 maxFee = (amount * 50) / FEE_DENOMINATOR;
            if (fee > maxFee) {
                fee = maxFee;
            }
        }

        return fee;
    }

    function validateTrade(
        uint256 amount,
        uint256 poolSize,
        bool isSell
    ) internal pure {
        require(amount >= MIN_TRADE_SIZE, "Amount too small");

        if (isSell) {
            require(
                poolSize - amount >= MIN_POOL_SIZE,
                "Insufficient liquidity"
            );
        } else {
            require(poolSize <= type(uint256).max - amount, "Pool overflow");
            // Allow larger trades but with higher fees
            require(amount <= poolSize * 10000, "Trade size too large");
        }
    }

    function calculateFee(
        uint256 amount,
        uint256 poolSize,
        uint256 oldPrice,
        uint256 newPrice
    ) internal view returns (uint256) {
        // Base fee of 1%
        uint256 fee = (amount * BASE_FEE) / FEE_DENOMINATOR;

        if (poolSize > 0) {
            // Calculate trade ratio (0-1000)
            uint256 tradeRatio = (amount * 1000) / (poolSize + amount);

            // Dynamic fee increases quadratically with trade ratio
            // For 100% of pool size: fee = 40%
            // For 50% of pool size: fee = 10%
            // For 10% of pool size: fee = 0.4%
            uint256 dynamicFee = (amount *
                DYNAMIC_FEE_NUMERATOR *
                tradeRatio *
                tradeRatio) / (DYNAMIC_FEE_DENOMINATOR * 1000 * 1000);
            fee += dynamicFee;

            // Add price impact fee
            uint256 priceChange;
            if (newPrice > oldPrice) {
                priceChange = newPrice - oldPrice;
            } else {
                priceChange = oldPrice - newPrice;
            }

            // Price impact fee increases with price change
            uint256 priceImpactFee = (amount *
                PRICE_IMPACT_FEE_NUMERATOR *
                priceChange) / (PRECISION * FEE_DENOMINATOR);
            fee += priceImpactFee;

            // Add sandwich protection
            if (lastTradeBlock[msg.sender] == block.number) {
                fee = fee * SANDWICH_FEE_MULTIPLIER;
            }

            // Add price reversal protection
            if (lastTradePrice[msg.sender] > 0) {
                if (
                    (newPrice > oldPrice &&
                        lastTradePrice[msg.sender] > oldPrice) ||
                    (newPrice < oldPrice &&
                        lastTradePrice[msg.sender] < oldPrice)
                ) {
                    fee = fee * 4; // 4x fees for potential sandwich attacks
                }
            }

            // Cap fee at 90% to prevent complete value extraction
            uint256 maxFee = (amount * 900) / FEE_DENOMINATOR;
            if (fee > maxFee) {
                fee = maxFee;
            }
        }

        return fee;
    }

    function buyShares(bool isYes) external payable nonReentrant {
        require(initialized, "Market not initialized");
        require(block.timestamp < endTime, "Market ended");
        require(!resolved, "Market already resolved");
        require(msg.value >= MIN_TRADE_SIZE, "Amount too small");

        uint256 inputAmount = msg.value;
        uint256 oldPrice = _getYesPrice();

        // Calculate new pool sizes first to get new price
        uint256 outputShares;
        uint256 newYesPool;
        uint256 newNoPool;

        if (isYes) {
            newYesPool = yesPool + inputAmount;
            uint256 k = yesPool * noPool;
            require(k / yesPool == noPool, "Constant product overflow");
            newNoPool = k / newYesPool;
            require(newNoPool < noPool, "Invalid trade");
            outputShares = noPool - newNoPool;
            require(outputShares > 0, "Zero shares output");
        } else {
            newNoPool = noPool + inputAmount;
            uint256 k = yesPool * noPool;
            require(k / noPool == yesPool, "Constant product overflow");
            newYesPool = k / newNoPool;
            require(newYesPool < yesPool, "Invalid trade");
            outputShares = yesPool - newYesPool;
            require(outputShares > 0, "Zero shares output");
        }

        // Calculate new price and fee
        uint256 newPrice = (newYesPool * PRECISION) / (newYesPool + newNoPool);
        uint256 fee = calculateFee(
            inputAmount,
            isYes ? yesPool : noPool,
            oldPrice,
            newPrice
        );
        uint256 inputAmountAfterFee = inputAmount - fee;
        accumulatedFees += fee;

        // Validate trade size and pool constraints
        validateTrade(inputAmountAfterFee, isYes ? yesPool : noPool, false);

        // Update state
        if (isYes) {
            yesPool = yesPool + inputAmountAfterFee;
            uint256 k = yesPool * noPool;
            noPool = k / yesPool;
            positions[msg.sender].yesShares += outputShares;
            totalYesShares += outputShares;
        } else {
            noPool = noPool + inputAmountAfterFee;
            uint256 k = yesPool * noPool;
            yesPool = k / noPool;
            positions[msg.sender].noShares += outputShares;
            totalNoShares += outputShares;
        }

        // Update last trade info
        lastTradeBlock[msg.sender] = block.number;
        lastTradePrice[msg.sender] = newPrice;

        totalLiquidity = yesPool + noPool;
        emit SharesPurchased(msg.sender, isYes, outputShares, inputAmount);
        emit PriceUpdated(_getYesPrice(), _getNoPrice());
    }

    function sellShares(
        bool isYes,
        uint256 sharesToSell
    ) external nonReentrant {
        require(initialized, "Market not initialized");
        require(block.timestamp < endTime, "Market ended");
        require(!resolved, "Market already resolved");
        require(sharesToSell >= MIN_TRADE_SIZE, "Amount too small");

        // Validate trade size and pool constraints
        validateTrade(sharesToSell, isYes ? yesPool : noPool, true);

        uint256 oldPrice = _getYesPrice();

        if (isYes) {
            require(
                positions[msg.sender].yesShares >= sharesToSell,
                "Insufficient shares"
            );
            uint256 newYesPool = yesPool - sharesToSell;

            uint256 k = yesPool * noPool;
            require(k / yesPool == noPool, "Constant product overflow");

            uint256 newNoPool = k / newYesPool;
            require(newNoPool > noPool, "Invalid trade");
            uint256 grossReturn = newNoPool - noPool;

            // Calculate new price and fee
            uint256 newPrice = (newYesPool * PRECISION) /
                (newYesPool + newNoPool);
            uint256 fee = calculateFee(grossReturn, noPool, oldPrice, newPrice);
            uint256 ethToReturn = grossReturn - fee;
            accumulatedFees += fee;
            require(ethToReturn > 0, "Zero ETH return");

            yesPool = newYesPool;
            noPool = newNoPool;
            positions[msg.sender].yesShares -= sharesToSell;
            totalYesShares -= sharesToSell;

            payable(msg.sender).transfer(ethToReturn);
            emit SharesSold(msg.sender, isYes, sharesToSell, ethToReturn);
        } else {
            require(
                positions[msg.sender].noShares >= sharesToSell,
                "Insufficient shares"
            );
            uint256 newNoPool = noPool - sharesToSell;

            uint256 k = yesPool * noPool;
            require(k / noPool == yesPool, "Constant product overflow");

            uint256 newYesPool = k / newNoPool;
            require(newYesPool > yesPool, "Invalid trade");
            uint256 grossReturn = newYesPool - yesPool;

            // Calculate new price and fee
            uint256 newPrice = (newYesPool * PRECISION) /
                (newYesPool + newNoPool);
            uint256 fee = calculateFee(
                grossReturn,
                yesPool,
                oldPrice,
                newPrice
            );
            uint256 ethToReturn = grossReturn - fee;
            accumulatedFees += fee;
            require(ethToReturn > 0, "Zero ETH return");

            noPool = newNoPool;
            yesPool = newYesPool;
            positions[msg.sender].noShares -= sharesToSell;
            totalNoShares -= sharesToSell;

            payable(msg.sender).transfer(ethToReturn);
            emit SharesSold(msg.sender, isYes, sharesToSell, ethToReturn);
        }

        // Update last trade info
        lastTradeBlock[msg.sender] = block.number;
        uint256 newPrice = _getYesPrice();
        lastTradePrice[msg.sender] = newPrice;

        totalLiquidity = yesPool + noPool;
        emit PriceUpdated(_getYesPrice(), _getNoPrice());
    }

    function getPosition(
        address user
    ) external view returns (uint256 yesShares, uint256 noShares) {
        Position memory pos = positions[user];
        return (pos.yesShares, pos.noShares);
    }

    function getMarketInfo()
        external
        view
        returns (
            uint256 _totalYesShares,
            uint256 _totalNoShares,
            uint256 _yesPool,
            uint256 _noPool,
            uint256 yesPrice,
            uint256 noPrice,
            bool isResolved,
            bool marketResult
        )
    {
        return (
            totalYesShares,
            totalNoShares,
            yesPool,
            noPool,
            _getYesPrice(),
            _getNoPrice(),
            resolved,
            result
        );
    }

    function _getYesPrice() internal view returns (uint256) {
        uint256 totalPool = yesPool + noPool;
        if (totalPool == 0) return PRECISION / 2; // 50% if no liquidity

        // Calculate raw price
        uint256 rawPrice = (yesPool * PRECISION) / totalPool;

        // Ensure prices sum to PRECISION
        if (rawPrice >= PRECISION) {
            return PRECISION - 1;
        } else if (rawPrice == 0 && noPool < totalPool) {
            return 1;
        }
        return rawPrice;
    }

    function _getNoPrice() internal view returns (uint256) {
        return PRECISION - _getYesPrice();
    }

    function getCurrentPrices()
        external
        view
        returns (uint256 yesPrice, uint256 noPrice)
    {
        yesPrice = _getYesPrice();
        noPrice = _getNoPrice();
    }

    function resolve(bool _result) external {
        require(msg.sender == resolverAddress, "Only resolver can resolve");
        require(block.timestamp >= endTime, "Market not ended");
        require(!resolved, "Already resolved");

        resolved = true;
        result = _result;

        emit MarketResolved(_result);
    }

    function claimWinnings() external nonReentrant {
        require(resolved, "Market not resolved yet");
        Position storage position = positions[msg.sender];

        uint256 winnings = 0;
        if (result) {
            // Yes won
            winnings = position.yesShares;
            position.yesShares = 0;
        } else {
            // No won
            winnings = position.noShares;
            position.noShares = 0;
        }

        require(winnings > 0, "No winnings to claim");
        payable(msg.sender).transfer(winnings);
    }

    // Add function to withdraw accumulated fees
    function withdrawFees() external {
        require(
            msg.sender == predictionMarket,
            "Only prediction market can withdraw fees"
        );
        require(accumulatedFees > 0, "No fees to withdraw");

        uint256 feesToWithdraw = accumulatedFees;
        accumulatedFees = 0;
        payable(predictionMarket).transfer(feesToWithdraw);
    }

    receive() external payable {}
}
