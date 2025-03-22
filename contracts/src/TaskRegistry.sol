// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OperatorRegistry.sol";
import "./IAutomataDcapAttestation.sol";
import "./sha/Sha2Ext.sol";

/**
 * @title TaskRegistry
 * @dev A contract for registering tasks with claims that need verification
 */
contract TaskRegistry {
    OperatorRegistry public operatorRegistry;
    IAutomataDcapAttestation public automataDcapAttestation;

    // Enum for claim verification result
    enum ClaimVerificationResult {
        PENDING,
        TRUE,
        FALSE,
        DEPENDS,
        INCONCLUSIVE,
        TOO_EARLY
    }

    // Task structure
    struct Task {
        string claim;
        address user;
        address operator;
        ClaimVerificationResult verificationResult;
    }

    // State variables
    uint256 public submissionFee;
    uint256 public taskCount;
    
    // Mapping from taskId to Task
    mapping(uint256 => Task) public tasks;
    
    // Events
    event TaskSubmitted(uint256 indexed taskId, address indexed user, address indexed operator, string claim);
    event TaskUpdated(uint256 indexed taskId, address indexed user, address indexed operator, ClaimVerificationResult verificationResult);

    /**
     * @dev Constructor sets the submission fee and owner
     * @param _submissionFee The fee required to submit a task
     */
    constructor(uint256 _submissionFee, address _operatorRegistry, address _automataDcapAttestation) {
        operatorRegistry = OperatorRegistry(_operatorRegistry);
        submissionFee = _submissionFee;
        taskCount = 0;
        automataDcapAttestation = IAutomataDcapAttestation(_automataDcapAttestation);
    }

    /**
     * @dev Submit a new task with a claim to be verified
     * @param _claim The claim to be verified
     */
    function submitTask(string memory _claim) external payable {
        require(msg.value >= submissionFee, "TaskRegistry: insufficient fee");
        
        uint32 operatorCount = operatorRegistry.getOperatorCountAtBlockNumber(block.number);
        if (operatorCount == 0) {
            revert("TaskRegistry: no operators available");
        }
        address operator = operatorRegistry.getActiveOperatorAt(block.timestamp % operatorCount);

        uint256 taskId = taskCount;
        tasks[taskId] = Task({
            claim: _claim,
            user: msg.sender,
            operator: operator,
            verificationResult: ClaimVerificationResult.PENDING
        });
        
        taskCount++;
        emit TaskSubmitted(taskId, msg.sender, operator, _claim);
    }

    /**
     * @dev Get task details
     * @param _taskId The ID of the task
     * @return task The task details
     */
    function getTask(uint256 _taskId) external view returns (
        Task memory task
    ) {
        require(_taskId < taskCount, "TaskRegistry: task does not exist");
        return tasks[_taskId];
    }

    /**
     * @dev Submit task verification result
     * @param _taskId The ID of the task to verify
     * @param _verificationResult The result of the claim verification
     */
    function submitVerificationResult(uint256 _taskId, ClaimVerificationResult _verificationResult, bytes calldata _teeRaQuote) external {
        require(_taskId < taskCount, "TaskRegistry: task does not exist");
        require(tasks[_taskId].verificationResult == ClaimVerificationResult.PENDING, "TaskRegistry: task already verified");
        require(_verificationResult != ClaimVerificationResult.PENDING, "TaskRegistry: verification result cannot be PENDING");
        require(msg.sender == tasks[_taskId].operator, "TaskRegistry: only operator can submit verification result");

        // Verify TEE RA Quote
        (bool success, bytes memory output) = automataDcapAttestation.verifyAndAttestOnChain(_teeRaQuote);
        if (!success) {
            revert(string(output));
        }
        // Extract RTMR3 from TEE RA Quote
        bytes memory rtmr3Bytes = new bytes(48);
        for (uint256 i = 520; i < 568; i++) {
            rtmr3Bytes[i - 520] = _teeRaQuote[i];
        }

        if (keccak256(rtmr3Bytes) != operatorRegistry.getOpeartorRtmr3(msg.sender)) {
            revert("TaskRegistry: RTMR3 mismatch");
        }

        // Verify claim is part of reportData
        // Verify decision is part of reportData
        bytes32 expectedReportDataHash1;
        bytes32 expectedReportDataHash2;
        if (_verificationResult == ClaimVerificationResult.TRUE) {
            (expectedReportDataHash1, expectedReportDataHash2) = Sha2Ext.sha512("app-data:true");
        } else if (_verificationResult == ClaimVerificationResult.FALSE) {
            (expectedReportDataHash1, expectedReportDataHash2) = Sha2Ext.sha512("app-data:false");
        } else if (_verificationResult == ClaimVerificationResult.DEPENDS) {
            (expectedReportDataHash1, expectedReportDataHash2) = Sha2Ext.sha512("app-data:depends");
        } else if (_verificationResult == ClaimVerificationResult.INCONCLUSIVE) {
            (expectedReportDataHash1, expectedReportDataHash2) = Sha2Ext.sha512("app-data:inconclusive");
        } else if (_verificationResult == ClaimVerificationResult.TOO_EARLY) {
            (expectedReportDataHash1, expectedReportDataHash2) = Sha2Ext.sha512("app-data:too_early");
        }
        bytes32 reportDataHash1 = bytes32(_teeRaQuote[568:600]);
        bytes32 reportDataHash2 = bytes32(_teeRaQuote[600:632]);
        if (reportDataHash1 != expectedReportDataHash1 || reportDataHash2 != expectedReportDataHash2) {
            revert("TaskRegistry: claim mismatch");
        }

        tasks[_taskId].verificationResult = _verificationResult;
        (success, ) = msg.sender.call{value: submissionFee}("");
        require(success, "TaskRegistry: payment failed");
        
        emit TaskUpdated(_taskId, tasks[_taskId].user, msg.sender, _verificationResult);
    }
}
