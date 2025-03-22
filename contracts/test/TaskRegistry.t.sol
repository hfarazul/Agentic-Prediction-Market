// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TaskRegistry.sol";
import "../src/IAutomataDcapAttestation.sol";

contract TaskRegistryTest is Test {
    TaskRegistry public taskRegistry;
    IAutomataDcapAttestation public automataDcapAttestation;
    OperatorRegistry public operatorRegistry;
    address public owner;
    address public user1;
    address public user2;
    uint256 public registrationFee = 0.1 ether;
    uint256 public submissionFee = 0.01 ether;
    bytes public sampleQuote = vm.readFileBinary(string.concat(vm.projectRoot(), "/test/assets/quote.bin"));

    function setUp() public {
        automataDcapAttestation = new MockAutomataDcapAttestation();

        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        
        // Fund test users
        vm.deal(user1, 1 ether);
        vm.deal(user2, 1 ether);
        
        // Deploy contract
        operatorRegistry = new OperatorRegistry(registrationFee, address(automataDcapAttestation));
        taskRegistry = new TaskRegistry(submissionFee, address(operatorRegistry), address(automataDcapAttestation));

        // Register operator
        vm.startPrank(user2);
        operatorRegistry.registerOperator{value: registrationFee}(sampleQuote);
        vm.stopPrank();
    }

    function testSubmitTask() public {
        string memory claim = "The sky is blue";
        
        // Submit task as user1
        vm.prank(user1);
        taskRegistry.submitTask{value: submissionFee}(claim);
        
        // Check task was created correctly
        TaskRegistry.Task memory task = taskRegistry.getTask(0);
        
        assertEq(task.claim, claim);
        assertEq(task.operator, user2);
        assertEq(uint(task.verificationResult), uint(TaskRegistry.ClaimVerificationResult.PENDING));
        assertEq(taskRegistry.taskCount(), 1);
    }

    function testSubmitTaskInsufficientFee() public {
        string memory claim = "The sky is blue";
        
        // Try to submit with insufficient fee
        vm.prank(user1);
        vm.expectRevert("TaskRegistry: insufficient fee");
        taskRegistry.submitTask{value: submissionFee - 0.001 ether}(claim);
    }

    function testVerifyTask() public {
        // First submit a task
        string memory claim = "The sky is blue";
        vm.prank(user1);
        taskRegistry.submitTask{value: submissionFee}(claim);
        
        // Verify the task as true
        vm.startPrank(user2);
        taskRegistry.submitVerificationResult(0, TaskRegistry.ClaimVerificationResult.TRUE, sampleQuote);
        vm.stopPrank();
        
        // Check task was verified correctly
        TaskRegistry.Task memory task = taskRegistry.getTask(0);
        assertEq(uint(task.verificationResult), uint(TaskRegistry.ClaimVerificationResult.TRUE));
    }

    function testVerifyTaskAlreadyVerified() public {
        // First submit a task
        string memory claim = "The sky is blue";
        vm.prank(user1);
        taskRegistry.submitTask{value: submissionFee}(claim);
        
        // Verify the task first time
        vm.startPrank(user2);
        taskRegistry.submitVerificationResult(0, TaskRegistry.ClaimVerificationResult.TRUE, sampleQuote);
        vm.stopPrank();
        
        // Try to verify again
        vm.expectRevert("TaskRegistry: task already verified");
        taskRegistry.submitVerificationResult(0, TaskRegistry.ClaimVerificationResult.FALSE, bytes(""));
    }

    function testVerifyTaskInvalidResult() public {
        // First submit a task
        string memory claim = "The sky is blue";
        vm.prank(user1);
        taskRegistry.submitTask{value: submissionFee}(claim);
        
        // Try to verify with PENDING result
        vm.prank(user2);
        vm.expectRevert("TaskRegistry: verification result cannot be PENDING");
        taskRegistry.submitVerificationResult(0, TaskRegistry.ClaimVerificationResult.PENDING, bytes(""));
    }

    function testGetNonExistentTask() public {
        vm.expectRevert("TaskRegistry: task does not exist");
        taskRegistry.getTask(0);
    }
}
