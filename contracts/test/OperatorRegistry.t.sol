// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/OperatorRegistry.sol";
import "../src/IAutomataDcapAttestation.sol";

contract OperatorRegistryTest is Test {
    OperatorRegistry public operatorRegistry;
    IAutomataDcapAttestation public automataDcapAttestation;
    address public owner;
    address public operator1;
    address public operator2;
    uint256 public registrationFee = 0.1 ether;
    bytes public sampleQuote = vm.readFileBinary(string.concat(vm.projectRoot(), "/test/assets/quote.bin"));

    function setUp() public {
        automataDcapAttestation = new MockAutomataDcapAttestation();
        
        owner = address(this);
        operator1 = makeAddr("operator1");
        operator2 = makeAddr("operator2");

        // Fund test operators
        vm.deal(operator1, 1 ether);
        vm.deal(operator2, 1 ether);
        
        // Deploy contract
        operatorRegistry = new OperatorRegistry(registrationFee, address(automataDcapAttestation));
    }

    function testRegisterOperator() public {
        // Register operator1
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Check operator status
        (bytes32 rtmr3, uint256 stake, OperatorRegistry.OperatorStatus status) = operatorRegistry.operators(operator1);
        assertEq(rtmr3, 0x855cf0247ef3431a596a2ba90e649318c2888e6372986fd5675f878c1055db8c, "Rtmr3 should be 0x855c...db8c");
        assertEq(uint(status), uint(OperatorRegistryStorage.OperatorStatus.Registered), "Operator should be registered");
        assertEq(stake, registrationFee, "Stake should equal registration fee");
        
        // Check active operators list
        assertTrue(operatorRegistry.isActiveOperator(operator1), "Operator should be in active list");
        
        // Check operator count
        assertEq(operatorRegistry.getActiveOperatorCount(), 1, "Active operator count should be 1");
        
        // Check operator index
        assertEq(operatorRegistry.currentOperatorIndex(operator1), 0, "Operator index should be 0");
    }
    
    function testRegisterOperatorInsufficientFee() public {
        // Try to register with insufficient fee
        vm.prank(operator1);
        vm.expectRevert("Insufficient ETH sent");
        operatorRegistry.registerOperator{value: registrationFee - 0.01 ether}(sampleQuote);
    }
    
    function testRegisterOperatorEmptyQuote() public {
        // Try to register with empty quote
        vm.prank(operator1);
        vm.expectRevert("Empty TEE RA quote");
        operatorRegistry.registerOperator{value: registrationFee}(bytes(""));
    }
    
    function testRegisterOperatorAlreadyRegistered() public {
        // Register operator1
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Try to register again
        vm.prank(operator1);
        vm.expectRevert("Already registered");
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
    }
    
    function testDepositEth() public {
        // Register operator1
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Deposit additional ETH
        uint256 additionalAmount = 0.5 ether;
        vm.prank(operator1);
        operatorRegistry.depositEth{value: additionalAmount}();
        
        // Check updated stake
        (, uint256 stake,) = operatorRegistry.operators(operator1);
        assertEq(stake, registrationFee + additionalAmount, "Stake should be updated");
    }
    
    function testDepositEthNotRegistered() public {
        // Try to deposit without registering
        vm.prank(operator1);
        vm.expectRevert("Not registered");
        operatorRegistry.depositEth{value: 0.1 ether}();
    }
    
    function testDepositEthZeroAmount() public {
        // Register operator1
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Try to deposit zero ETH
        vm.prank(operator1);
        vm.expectRevert("Must send ETH");
        operatorRegistry.depositEth{value: 0}();
    }
    
    function testWithdrawEth() public {
        // Register operator1 with extra funds
        uint256 initialDeposit = registrationFee + 0.5 ether;
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: initialDeposit}(sampleQuote);
        
        // Withdraw some ETH
        uint256 withdrawAmount = 0.2 ether;
        uint256 balanceBefore = operator1.balance;
        
        vm.prank(operator1);
        operatorRegistry.withdrawEth(withdrawAmount);
        
        // Check updated stake and balance
        (, uint256 stake,) = operatorRegistry.operators(operator1);
        assertEq(stake, initialDeposit - withdrawAmount, "Stake should be reduced");
        assertEq(operator1.balance, balanceBefore + withdrawAmount, "ETH should be transferred");
    }
    
    function testWithdrawEthBelowRegistrationFee() public {
        // Register operator1 with extra funds
        uint256 initialDeposit = registrationFee + 0.05 ether;
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: initialDeposit}(sampleQuote);
        
        // Withdraw amount that puts stake below registration fee
        uint256 withdrawAmount = 0.06 ether;
        
        vm.prank(operator1);
        operatorRegistry.withdrawEth(withdrawAmount);
        
        // Check operator is now deregistered
        (,, OperatorRegistry.OperatorStatus status) = operatorRegistry.operators(operator1);
        assertEq(uint(status), uint(OperatorRegistryStorage.OperatorStatus.Deregistered), "Operator should be deregistered");
        assertFalse(operatorRegistry.isActiveOperator(operator1), "Operator should not be in active list");
        
        // Check operator count
        assertEq(operatorRegistry.getActiveOperatorCount(), 0, "Active operator count should be 0");
    }
    
    function testWithdrawEthInsufficientBalance() public {
        // Register operator1
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Try to withdraw more than available
        vm.prank(operator1);
        vm.expectRevert("Insufficient balance");
        operatorRegistry.withdrawEth(registrationFee + 0.1 ether);
    }
    
    function testDeregisteredOperatorCannotDeposit() public {
        // Register operator1
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Withdraw to become deregistered
        vm.prank(operator1);
        operatorRegistry.withdrawEth(0.05 ether);
        
        // Verify operator is deregistered
        assertFalse(operatorRegistry.isActiveOperator(operator1), "Operator should be deregistered");
        
        // Try to deposit after being deregistered
        vm.prank(operator1);
        vm.expectRevert("Not registered");
        operatorRegistry.depositEth{value: 0.1 ether}();
        
        // Verify operator count remains at 0
        assertEq(operatorRegistry.getActiveOperatorCount(), 0, "Active operator count should be 0");
    }
    
    function testGetActiveOperatorAt() public {
        // Register two operators
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        vm.prank(operator2);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Get operators by index
        address retrievedOperator0 = operatorRegistry.getActiveOperatorAt(0);
        address retrievedOperator1 = operatorRegistry.getActiveOperatorAt(1);
        
        // Check that both operators are retrieved correctly
        assertTrue(
            (retrievedOperator0 == operator1 && retrievedOperator1 == operator2) ||
            (retrievedOperator0 == operator2 && retrievedOperator1 == operator1),
            "Retrieved operators should match registered operators"
        );
    }
    
    function testGetActiveOperatorAtOutOfBounds() public {
        // Try to get operator at invalid index
        vm.expectRevert("Index out of bounds");
        operatorRegistry.getActiveOperatorAt(0);
    }
    
    function testGetContractBalance() public {
        // Register two operators
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        vm.prank(operator2);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Check contract balance
        assertEq(operatorRegistry.getContractBalance(), 2 * registrationFee, "Contract balance should equal total deposits");
    }
    
    function testGetOperatorList() public {
        // Register two operators
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        vm.prank(operator2);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Get operator list
        address[] memory operators = operatorRegistry.getOperatorList();
        
        // Check list length
        assertEq(operators.length, 2, "Operator list should have 2 entries");
        
        // Check that both operators are in the list
        assertTrue(
            (operators[0] == operator1 && operators[1] == operator2) ||
            (operators[0] == operator2 && operators[1] == operator1),
            "Operator list should contain both operators"
        );
    }
    
    function testDeregisterAndReindexOperators() public {
        // Register three operators
        vm.prank(operator1);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        address operator3 = makeAddr("operator3");
        vm.deal(operator3, 1 ether);
        vm.prank(operator3);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        vm.prank(operator2);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        
        // Deregister the middle operator (operator3)
        vm.prank(operator3);
        operatorRegistry.withdrawEth(0.05 ether);
        
        // Check that operator3 is deregistered
        assertFalse(operatorRegistry.isActiveOperator(operator3), "Operator3 should be deregistered");
        
        // Check that the last operator (operator2) was moved to operator3's position
        address[] memory operators = operatorRegistry.getOperatorList();
        assertEq(operators.length, 2, "Operator list should have 2 entries");
        
        // Check that operator2's index was updated
        uint32 operator2Index = operatorRegistry.currentOperatorIndex(operator2);
        assertTrue(operator2Index < 2, "Operator2 should have been moved to an earlier index");
    }
}
