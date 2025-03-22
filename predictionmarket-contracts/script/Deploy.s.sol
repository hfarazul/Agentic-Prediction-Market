// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {Market} from "../src/Market.sol";
import {console2} from "forge-std/console2.sol";

contract DeployPredictionMarket is Script {
    // Configuration
    uint256 public constant INITIAL_CREATION_FEE = 100; // 1%
    uint256 public constant INITIAL_TRADING_FEE = 50; // 0.5%
    uint256 public constant INITIAL_LIQUIDITY = 1 ether;

    function run() external {
        // Get deployment private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Deploy PredictionMarket contract
        PredictionMarket predictionMarket = new PredictionMarket();
        console2.log(
            "PredictionMarket deployed at:",
            address(predictionMarket)
        );

        // Create a test market if we're on a test network
        if (block.chainid != 1) {
            // Not mainnet
            // Set up test market parameters
            string memory question = "Will ETH reach $5000 by the end of 2024?";
            string
                memory details = "The market will resolve to YES if the price of ETH/USD reaches or exceeds $5000 on any major exchange before December 31st, 2024 23:59:59 UTC.";
            uint256 endTime = block.timestamp + 365 days; // 1 year from now
            string memory imageUrl = "https://example.com/eth.png";
            address resolverAddress = deployerAddress; // Use deployer as resolver for test

            // Create market with initial fee
            uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
                question,
                details,
                endTime,
                imageUrl,
                resolverAddress
            );
            address marketAddress = predictionMarket.getMarket(marketId);
            console2.log("Test market created at:", marketAddress);

            // Initialize market with liquidity
            Market(payable(marketAddress)).initializeMarket{
                value: INITIAL_LIQUIDITY
            }();
            console2.log("Test market initialized with:", INITIAL_LIQUIDITY);
        }

        vm.stopBroadcast();

        // Log deployment information
        console2.log("Deployment completed!");
        console2.log("Network:", block.chainid);
        console2.log("Deployer:", deployerAddress);
    }
}

contract UpgradePredictionMarket is Script {
    function run() external {
        // Get deployment private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Add upgrade logic here when needed

        vm.stopBroadcast();
    }
}
