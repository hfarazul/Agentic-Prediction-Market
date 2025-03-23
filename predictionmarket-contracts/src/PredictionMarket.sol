// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Market.sol";

contract PredictionMarket is Ownable, ReentrancyGuard {
    // Mapping from market ID to Market contract address
    mapping(uint256 => address) public markets;
    uint256 public nextMarketId;

    // Fee configuration
    uint256 public creationFee;
    uint256 public tradingFee;
    uint256 public constant FEE_DENOMINATOR = 10000;

    // Events
    event MarketCreated(
        uint256 indexed marketId,
        address indexed market,
        string question,
        string details,
        string imageUrl,
        uint256 endTime
    );
    event MarketResolved(uint256 indexed marketId, bool result);
    event FeesUpdated(uint256 creationFee, uint256 tradingFee);
    event MarketFeesWithdrawn(uint256 indexed marketId, uint256 amount);

    constructor() Ownable(msg.sender) {
        creationFee = 100; // 1%
        tradingFee = 50; // 0.5%
    }

    function createMarket(
        string memory question,
        string memory details,
        uint256 endTime,
        string memory imageUrl,
        address resolverAddress
    ) external payable nonReentrant returns (uint256) {
        require(msg.value >= creationFee, "Insufficient creation fee");
        require(endTime > block.timestamp, "End time must be in the future");
        require(bytes(question).length > 0, "Question cannot be empty");

        // Create resolver URL from question for backward compatibility
        string memory resolverUrl = "https://api.example.com/eth-price";

        Market newMarket = new Market(
            question,
            details,
            endTime,
            imageUrl,
            resolverUrl,
            resolverAddress,
            address(this)
        );

        uint256 marketId = nextMarketId++;
        markets[marketId] = address(newMarket);

        emit MarketCreated(
            marketId,
            address(newMarket),
            question,
            details,
            imageUrl,
            endTime
        );

        return marketId;
    }

    function getMarket(uint256 marketId) external view returns (address) {
        return markets[marketId];
    }

    function updateFees(
        uint256 _creationFee,
        uint256 _tradingFee
    ) external onlyOwner {
        require(_creationFee <= 1000, "Creation fee too high"); // Max 10%
        require(_tradingFee <= 500, "Trading fee too high"); // Max 5%

        creationFee = _creationFee;
        tradingFee = _tradingFee;

        emit FeesUpdated(_creationFee, _tradingFee);
    }

    // Withdraw fees from a specific market
    function withdrawMarketFees(uint256 marketId) external onlyOwner {
        address marketAddress = markets[marketId];
        require(marketAddress != address(0), "Market does not exist");

        Market market = Market(payable(marketAddress));
        uint256 feesBeforeWithdraw = market.accumulatedFees();
        require(feesBeforeWithdraw > 0, "No fees to withdraw");

        // First withdraw from market to this contract
        market.withdrawFees();

        // Then transfer to owner
        payable(owner()).transfer(feesBeforeWithdraw);

        emit MarketFeesWithdrawn(marketId, feesBeforeWithdraw);
    }

    // Withdraw fees from multiple markets
    function withdrawMarketFeesBatch(
        uint256[] calldata marketIds
    ) external onlyOwner {
        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < marketIds.length; i++) {
            address marketAddress = markets[marketIds[i]];
            if (marketAddress != address(0)) {
                Market market = Market(payable(marketAddress));
                uint256 marketFees = market.accumulatedFees();
                if (marketFees > 0) {
                    market.withdrawFees();
                    totalWithdrawn += marketFees;
                    emit MarketFeesWithdrawn(marketIds[i], marketFees);
                }
            }
        }

        if (totalWithdrawn > 0) {
            payable(owner()).transfer(totalWithdrawn);
        }
    }

    // Withdraw all accumulated fees from PredictionMarket contract
    function withdrawFees() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    receive() external payable {}
}
