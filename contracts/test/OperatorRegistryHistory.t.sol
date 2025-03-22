// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/OperatorRegistry.sol";
import "../src/OperatorRegistryStorage.sol";
import "../src/IAutomataDcapAttestation.sol";

contract OperatorRegistryHistoryTest is Test {
    OperatorRegistry public operatorRegistry;
    IAutomataDcapAttestation public automataDcapAttestation;
    address public owner;
    address public operator1;
    address public operator2;
    address public operator3;
    uint256 public registrationFee = 0.1 ether;
    bytes public sampleQuote = vm.readFileBinary(string.concat(vm.projectRoot(), "/test/assets/quote.bin"));

    function setUp() public {
        automataDcapAttestation = new MockAutomataDcapAttestation();

        owner = address(this);
        operator1 = makeAddr("operator1");
        operator2 = makeAddr("operator2");
        operator3 = makeAddr("operator3");
        
        // Fund test operators
        vm.deal(operator1, 1 ether);
        vm.deal(operator2, 1 ether);
        vm.deal(operator3, 1 ether);
        
        // Deploy contract
        operatorRegistry = new OperatorRegistry(registrationFee, address(automataDcapAttestation));
    }

    function testOperatorIndexHistory() public {
        // Register operator1 at block 1
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        uint256 block1 = vm.getBlockNumber();
        
        // Move to next block
        vm.roll(block1 + 1);
        
        // Register operator2 at block 2
        vm.prank(operator2);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        uint256 block2 = vm.getBlockNumber();
        
        // Move to next block
        vm.roll(block2 + 1);
        
        // Deregister operator1 by withdrawing below registration fee
        vm.prank(operator1);
        operatorRegistry.withdrawEth(0.05 ether);
        
        uint256 block3 = vm.getBlockNumber();
        
        // Move to next block
        vm.roll(block3 + 1);
        
        // Register operator3 at block 4
        vm.prank(operator3);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        uint256 block4 = vm.getBlockNumber();
        
        // Check historical operator indices
        assertEq(operatorRegistry.getOperatorAtIndexAt(0, block1), operator1, "Operator1 should be at index 0 at block1");
        assertEq(operatorRegistry.getOperatorAtIndexAt(0, block2), operator1, "Operator1 should be at index 0 at block2");
        assertEq(operatorRegistry.getOperatorAtIndexAt(1, block2), operator2, "Operator2 should be at index 1 at block2");
        
        // After operator1 is deregistered, operator2 should move to index 0
        assertEq(operatorRegistry.getOperatorAtIndexAt(0, block3), operator2, "Operator2 should be at index 0 at block3");
        
        // After operator3 registers, they should be at index 1
        assertEq(operatorRegistry.getOperatorAtIndexAt(0, block4), operator2, "Operator2 should be at index 0 at block4");
        assertEq(operatorRegistry.getOperatorAtIndexAt(1, block4), operator3, "Operator3 should be at index 1 at block4");
    }
    
    function testOperatorListAtBlockNumber() public {
        // Register operator1 at block 1
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        uint256 block1 = vm.getBlockNumber();
        
        // Move to next block
        vm.roll(block1 + 1);
        
        // Register operator2 at block 2
        vm.prank(operator2);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        uint256 block2 = vm.getBlockNumber();
        
        // Move to next block
        vm.roll(block2 + 1);
        
        // Deregister operator1 by withdrawing below registration fee
        vm.prank(operator1);
        operatorRegistry.withdrawEth(0.05 ether);
        
        uint256 block3 = vm.getBlockNumber();
        
        // Check operator list at different blocks
        address[] memory operatorsAtBlock1 = operatorRegistry.getOperatorListAtBlockNumber(block1);
        assertEq(operatorsAtBlock1.length, 1, "Should be 1 operator at block1");
        assertEq(operatorsAtBlock1[0], operator1, "Operator1 should be in list at block1");
        
        address[] memory operatorsAtBlock2 = operatorRegistry.getOperatorListAtBlockNumber(block2);
        assertEq(operatorsAtBlock2.length, 2, "Should be 2 operators at block2");
        assertEq(operatorsAtBlock2[0], operator1, "Operator1 should be in list at block2");
        assertEq(operatorsAtBlock2[1], operator2, "Operator2 should be in list at block2");
        
        address[] memory operatorsAtBlock3 = operatorRegistry.getOperatorListAtBlockNumber(block3);
        assertEq(operatorsAtBlock3.length, 1, "Should be 1 operator at block3");
        assertEq(operatorsAtBlock3[0], operator2, "Operator2 should be in list at block3");
    }
}
