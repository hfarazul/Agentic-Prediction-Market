// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAutomataDcapAttestation.sol";

/**
 * @title OperatorRegistryStorage
 * @dev Base contract containing all storage variables for OperatorRegistry
 */
contract OperatorRegistryStorage {
    IAutomataDcapAttestation public automataDcapAttestation;

    // TEE parameters (MRTD, RTMR0, RTMR1, RTMR2 are static and precalculated)
    // bytes public constant MRTD = hex"c68518a0ebb42136c12b2275164f8c72f25fa9a34392228687ed6e9caeb9c0f1dbd895e9cf475121c029dc47e70e91fd";
    // bytes public constant RTMR0 = hex"85e0855a6384fa1c8a6ab36d0dcbfaa11a5753e5a070c08218ae5fe872fcb86967fd2449c29e22e59dc9fec998cb6547";
    // bytes public constant RTMR1 = hex"4a7db64a609c77e85f603c23e9a9fd03bfd9e6b52ce527f774a598e66d58386026cea79b2aea13b81a0b70cfacdec0ca";
    // bytes public constant RTMR2 = hex"8a4fe048fea22663152ef128853caa5c033cbe66baf32ba1ff7f6b1afc1624c279f50a4cbc522a735ca6f69551e61ef2";

    // RTMR3 is based on rootfs hash, app id (first 20 bytes of compose hash) hash, compose hash, ca cert hash and instance id
    // out of which only rootfs hash and ca cert hash are static
    // bytes public constant ROOTFS_HASH_DIGEST = hex"738ae348dbf674b3399300c0b9416c203e9b645c6ffee233035d09003cccad12f71becc805ad8d97575bc790c6819216";
    // bytes public constant CA_CERT_HASH_DIGEST = hex"5b6a576d1da40f04179ad469e00f90a1c0044bc9e8472d0da2776acb108dc98a73560d42cea6b8b763eb4a0e6d4d82d5";

    // Registration fee amount
    uint256 public registrationFee;
    
    // Operator status enum
    enum OperatorStatus {
        NotRegistered,
        Registered,
        Deregistered
    }
    
    // Operator information struct
    struct OperatorInfo {
        bytes32 rtmr3;
        uint256 stake;
        OperatorStatus status;
    }
    
    // Mapping from operator address to operator information
    mapping(address => OperatorInfo) public operators;
    
    // Constant for non-existent operator
    bytes32 public constant OPERATOR_DOES_NOT_EXIST_ID = bytes32(0);
    
    // History tracking structures
    
    // Struct to track operator updates
    struct OperatorUpdate {
        address operatorId;
        OperatorStatus status;
        uint32 fromBlockNumber;
    }
    
    // Struct to track total operator count updates
    struct OperatorCountUpdate {
        uint32 numOperators;
        uint32 fromBlockNumber;
    }
    
    // Current index of each operator
    mapping(address => uint32) public currentOperatorIndex;
    
    // History of active operator count changes
    OperatorCountUpdate[] internal _operatorCountHistory;
    
    // History of operators at each index
    mapping(uint32 => OperatorUpdate[]) internal _operatorIndexHistory;
    
    // Events
    event OperatorRegistered(address indexed operator, uint256 ethAmount);
    event OperatorDeregistered(address indexed operator, string reason);
    event EthDeposited(address indexed operator, uint256 amount);
    event EthWithdrawn(address indexed operator, uint256 amount);
    event OperatorIndexUpdate(address indexed operator, uint32 index);
    event OperatorCountChanged(uint32 numOperators);

    constructor(uint256 _registrationFee, address _automataDcapAttestation) {
        require(_registrationFee > 0, "Fee must be greater than 0");
        registrationFee = _registrationFee;
        automataDcapAttestation = IAutomataDcapAttestation(_automataDcapAttestation);

        // Initialize operator count history with zero operators
        _operatorCountHistory.push(OperatorCountUpdate({
            numOperators: 0,
            fromBlockNumber: uint32(block.number)
        }));
    }
} 