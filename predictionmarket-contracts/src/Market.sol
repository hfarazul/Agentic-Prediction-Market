// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Market is ReentrancyGuard {
    struct Position {
        uint256 yesShares;
        uint256 noShares;
    }

    string public question;
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

    // CPMM variables
    uint256 public yesPool;
    uint256 public noPool;

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

    constructor(
        string memory _question,
        uint256 _endTime,
        string memory _resolverUrl,
        address _resolverAddress,
        address _predictionMarket
    ) {
        question = _question;
        endTime = _endTime;
        resolverUrl = _resolverUrl;
        resolverAddress = _resolverAddress;
        predictionMarket = _predictionMarket;

        // Start with zero liquidity - requires initialization
        yesPool = 0;
        noPool = 0;
        initialized = false;
    }

    function initializeMarket() external payable nonReentrant {
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

    function buyShares(bool isYes) external payable nonReentrant {
        require(initialized, "Market not initialized");
        require(block.timestamp < endTime, "Market ended");
        require(msg.value > 0, "Must send ETH to buy shares");
        require(!resolved, "Market already resolved");

        uint256 sharesToMint;
        uint256 cost;

        if (isYes) {
            sharesToMint = calculateSharesOut(msg.value, yesPool, noPool);
            cost = msg.value;
            yesPool += cost;

            positions[msg.sender].yesShares += sharesToMint;
            totalYesShares += sharesToMint;
        } else {
            sharesToMint = calculateSharesOut(msg.value, noPool, yesPool);
            cost = msg.value;
            noPool += cost;

            positions[msg.sender].noShares += sharesToMint;
            totalNoShares += sharesToMint;
        }

        emit SharesPurchased(msg.sender, isYes, sharesToMint, cost);
        emit PriceUpdated(_getYesPrice(), _getNoPrice());
    }

    function sellShares(
        bool isYes,
        uint256 sharesToSell
    ) external nonReentrant {
        require(initialized, "Market not initialized");
        require(block.timestamp < endTime, "Market ended");
        require(!resolved, "Market already resolved");
        require(sharesToSell > 0, "Must sell non-zero shares");

        Position storage position = positions[msg.sender];
        uint256 ethToReturn;

        if (isYes) {
            require(
                position.yesShares >= sharesToSell,
                "Insufficient yes shares"
            );
            ethToReturn = calculateEthReturn(sharesToSell, yesPool, noPool);
            position.yesShares -= sharesToSell;
            totalYesShares -= sharesToSell;
            yesPool -= ethToReturn;
        } else {
            require(
                position.noShares >= sharesToSell,
                "Insufficient no shares"
            );
            ethToReturn = calculateEthReturn(sharesToSell, noPool, yesPool);
            position.noShares -= sharesToSell;
            totalNoShares -= sharesToSell;
            noPool -= ethToReturn;
        }

        payable(msg.sender).transfer(ethToReturn);
        emit SharesSold(msg.sender, isYes, sharesToSell, ethToReturn);
        emit PriceUpdated(_getYesPrice(), _getNoPrice());
    }

    function calculateSharesOut(
        uint256 ethIn,
        uint256 poolIn,
        uint256 poolOut
    ) public pure returns (uint256) {
        // Using constant product formula: x * y = k
        uint256 k = poolIn * poolOut;
        uint256 newPoolIn = poolIn + ethIn;
        uint256 newPoolOut = k / newPoolIn;
        return poolOut - newPoolOut;
    }

    function calculateEthReturn(
        uint256 sharesToSell,
        uint256 poolIn,
        uint256 poolOut
    ) public pure returns (uint256) {
        // Reverse of shares out calculation
        uint256 k = poolIn * poolOut;
        uint256 newPoolOut = poolOut + sharesToSell;
        uint256 newPoolIn = k / newPoolOut;
        return poolIn - newPoolIn;
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
        if (totalPool == 0) return PRECISION / 2;
        return (yesPool * PRECISION) / totalPool;
    }

    function _getNoPrice() internal view returns (uint256) {
        uint256 totalPool = yesPool + noPool;
        if (totalPool == 0) return PRECISION / 2;
        return (noPool * PRECISION) / totalPool;
    }

    function getCurrentPrices()
        external
        view
        returns (uint256 yesPrice, uint256 noPrice)
    {
        return (_getYesPrice(), _getNoPrice());
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

    receive() external payable {}
}
