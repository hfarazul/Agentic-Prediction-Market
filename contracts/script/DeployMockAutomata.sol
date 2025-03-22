// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TaskRegistry.sol";
import "../src/IAutomataDcapAttestation.sol";

contract DeployMockAutomata is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);  
        IAutomataDcapAttestation automataDcapAttestation = new MockAutomataDcapAttestation();
        vm.stopBroadcast();
        console.log("AutomataDcapAttestation deployed at:", address(automataDcapAttestation));
    }
}
