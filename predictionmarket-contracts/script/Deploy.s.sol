// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {Market} from "../src/Market.sol";
import {Resolver} from "../src/Resolver.sol";
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

        // Deploy the resolver too
        Resolver resolver = new Resolver(deployerAddress);
        console2.log("Resolver deployed at:", address(resolver));

        // Create a test market if we're on a test network
        if (block.chainid != 1) {
            // Not mainnet
            // Set up test market parameters
            string memory question = "Will ETH reach $5000 by the end of 2024?";
            string
                memory details = "The market will resolve to YES if the price of ETH/USD reaches or exceeds $5000 on any major exchange before December 31st, 2024 23:59:59 UTC.";
            uint256 endTime = block.timestamp + 365 days; // 1 year from now
            string memory imageUrl = "https://example.com/eth.png";
            address resolverAddress = address(resolver);
            string memory resolverUrl = "https://api.example.com/eth-price";

            // Create market with initial fee
            uint256 marketId = predictionMarket.createMarket{value: 0.1 ether}(
                question,
                details,
                endTime,
                imageUrl,
                resolverUrl,
                resolverAddress
            );
            address marketAddress = predictionMarket.getMarket(marketId);
            console2.log("Test market created at:", marketAddress);
        }

        vm.stopBroadcast();

        // Log deployment information
        console2.log("Deployment completed!");
        console2.log("Network:", block.chainid);
        console2.log("Deployer:", deployerAddress);
    }
}
