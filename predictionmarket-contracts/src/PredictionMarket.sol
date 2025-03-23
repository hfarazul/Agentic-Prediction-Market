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

    constructor() Ownable(msg.sender) {}

    function createMarket(
        address creator,
        string memory question,
        string memory details,
        uint256 endTime,
        string memory imageUrl,
        string memory resolverUrl,
        address resolverAddress
    ) external payable nonReentrant returns (uint256) {
        require(endTime > block.timestamp, "End time must be in the future");
        require(bytes(question).length > 0, "Question cannot be empty");

        Market newMarket = new Market{value: msg.value}(
            creator,
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
