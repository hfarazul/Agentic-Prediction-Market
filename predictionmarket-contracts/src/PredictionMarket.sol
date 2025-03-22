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
        uint256 endTime
    );
    event MarketResolved(uint256 indexed marketId, bool result);
    event FeesUpdated(uint256 creationFee, uint256 tradingFee);

    constructor() Ownable(msg.sender) {
        creationFee = 100; // 1%
        tradingFee = 50; // 0.5%
    }

    function createMarket(
        string memory question,
        uint256 endTime,
        string memory resolverUrl,
        address resolverAddress
    ) external payable nonReentrant returns (uint256) {
        require(msg.value >= creationFee, "Insufficient creation fee");
        require(endTime > block.timestamp, "End time must be in the future");

        Market newMarket = new Market(
            question,
            endTime,
            resolverUrl,
            resolverAddress,
            address(this)
        );

        uint256 marketId = nextMarketId++;
        markets[marketId] = address(newMarket);

        emit MarketCreated(marketId, address(newMarket), question, endTime);

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

    function withdrawFees() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    receive() external payable {}
}
