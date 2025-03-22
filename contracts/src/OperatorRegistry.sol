// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OperatorRegistryStorage.sol";

/**
 * @title OperatorRegistry
 * @dev Contract for registering operators with TEE RA quotes and managing their status
 * Includes historical tracking of operator count and indices
 */
contract OperatorRegistry is OperatorRegistryStorage {
    /**
     * @dev Constructor
     * @param _registrationFee The fee required to register as an operator
     */
    constructor(uint256 _registrationFee, address _automataDcapAttestation) OperatorRegistryStorage(_registrationFee, _automataDcapAttestation) {}

    /**
     * @dev Register as an operator with a TEE RA quote
     * @param teeRaQuote The TEE RA quote for verification
     */
    function registerOperator(bytes calldata teeRaQuote) external payable {
        require(operators[msg.sender].status != OperatorStatus.Registered, "Already registered");
        require(teeRaQuote.length > 0, "Empty TEE RA quote");
        require(msg.value >= registrationFee, "Insufficient ETH sent");

        // Verify TEE RA quote
        (bool success, bytes memory output) = automataDcapAttestation.verifyAndAttestOnChain(teeRaQuote);
        if (!success) {
            revert(string(output));
        }

        // TODO: Verify RTMR3's value with Risc0 ZKP
        // It must be
        // A = SHA384(INIT_MR, ROOTFS_HASH_DIGEST)
        // B = SHA384(A, APP_ID_DIGEST)
        // C = SHA384(B, COMPOSE_HASH_DIGEST)
        // D = SHA384(C, CA_CERT_HASH_DIGEST)
        // RTMR3 = SHA384(D, INSTANCE_ID_DIGEST)

        bytes memory rtmr3Bytes = new bytes(48);
        for (uint256 i = 520; i < 568; i++) {
            rtmr3Bytes[i - 520] = teeRaQuote[i];
        }
        bytes32 rtmr3 = keccak256(rtmr3Bytes);

        // Register the operator
        operators[msg.sender] = OperatorInfo({
            rtmr3: rtmr3, // Store RTMR3 so from now on it can be used directly for verification
            stake: msg.value,
            status: OperatorStatus.Registered
        });

        // Increase the operator count and assign the operator to the new index
        uint32 newOperatorCount = _increaseOperatorCount();
        _assignOperatorToIndex(msg.sender, newOperatorCount - 1);

        emit OperatorRegistered(msg.sender, msg.value);
    }

    /**
     * @dev Get the RTMR3 for an operator
     * @param operator The address of the operator
     * @return The RTMR3 for the operator
     */
    function getOpeartorRtmr3(address operator) external view returns (bytes32) {
        return operators[operator].rtmr3;
    }
    
    /**
     * @dev Deposit additional ETH to increase operator's balance
     */
    function depositEth() external payable {
        require(operators[msg.sender].status == OperatorStatus.Registered, "Not registered");
        require(msg.value > 0, "Must send ETH");
        
        // Update operator's ETH balance
        operators[msg.sender].stake += msg.value;
        emit EthDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw ETH from operator's balance
     * @param amount Amount of ETH to withdraw in wei
     */
    function withdrawEth(uint256 amount) external {
        require(operators[msg.sender].status == OperatorStatus.Registered, "Not registered");
        require(amount > 0, "Amount must be greater than 0");
        require(operators[msg.sender].stake >= amount, "Insufficient balance");
        
        // Update operator's ETH balance
        operators[msg.sender].stake -= amount;
        
        // If stake falls below registration fee, deregister the operator
        if (operators[msg.sender].stake < registrationFee) {
            _deregisterOperator(msg.sender, "Withdrawal below registration fee");
        }

        // Transfer ETH to operator
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
        
        emit EthWithdrawn(msg.sender, amount);
    }
    
    /**
     * @dev Deregister an operator
     * @param operator Address of the operator to deregister
     * @param reason Reason for deregistration
     */
    function _deregisterOperator(address operator, string memory reason) internal {
        if (operators[operator].status != OperatorStatus.Registered) {
            return;
        }

        // Get current index before removal
        uint32 operatorIndexToRemove = currentOperatorIndex[operator];
        
        // Update operator status
        operators[operator].status = OperatorStatus.Deregistered;
        
        // Decrease the operator count
        uint32 newOperatorCount = _decreaseOperatorCount();
        
        // Pop the last operator and place it in the removed operator's position if needed
        address lastOperatorId = _popLastOperator(newOperatorCount);
        if (operator != lastOperatorId && lastOperatorId != address(0)) {
            _assignOperatorToIndex(lastOperatorId, operatorIndexToRemove);
        }

        emit OperatorDeregistered(operator, reason);
    }
    
    /**
     * @dev Slash an operator by reducing their ETH balance
     * @param operator Address of the operator to slash
     * @param amount Amount of ETH to slash in wei
     */
    function slashOperator(address operator, uint256 amount) internal {
        require(operators[operator].status == OperatorStatus.Registered, "Not registered");
        require(amount > 0, "Amount must be greater than 0");
        
        // Reduce operator's ETH balance
        operators[operator].stake -= amount;
        
        // If operator's stake falls below registration fee, deregister them
        if (operators[operator].stake < registrationFee) {
            _deregisterOperator(operator, "Slashed");
        }
    }

    /*******************************************************************************
                                INTERNAL FUNCTIONS
    *******************************************************************************/

    /**
     * @notice Increases the historical operator count by 1 and returns the new count
     */
    function _increaseOperatorCount() internal returns (uint32) {
        OperatorCountUpdate storage lastUpdate = _latestOperatorCountUpdate();
        uint32 newOperatorCount = lastUpdate.numOperators + 1;
        
        _updateOperatorCountHistory(lastUpdate, newOperatorCount);

        // If this is the first time we're using this operatorIndex, push its first update
        if (_operatorIndexHistory[newOperatorCount - 1].length == 0) {
            _operatorIndexHistory[newOperatorCount - 1].push(OperatorUpdate({
                operatorId: address(0),
                status: OperatorStatus.NotRegistered,
                fromBlockNumber: uint32(block.number)
            }));
        }

        return newOperatorCount;
    }

    /**
     * @notice Decreases the historical operator count by 1 and returns the new count
     */
    function _decreaseOperatorCount() internal returns (uint32) {
        OperatorCountUpdate storage lastUpdate = _latestOperatorCountUpdate();
        uint32 newOperatorCount = lastUpdate.numOperators - 1;
        
        _updateOperatorCountHistory(lastUpdate, newOperatorCount);
        
        return newOperatorCount;
    }

    /**
     * @notice Update `_operatorCountHistory` with a new operator count
     * @dev If the lastUpdate was made in the this block, update the entry.
     * Otherwise, push a new historical entry.
     */
    function _updateOperatorCountHistory(
        OperatorCountUpdate storage lastUpdate,
        uint32 newOperatorCount
    ) internal {
        if (lastUpdate.fromBlockNumber == uint32(block.number)) {
            lastUpdate.numOperators = newOperatorCount;
        } else {
            _operatorCountHistory.push(OperatorCountUpdate({
                numOperators: newOperatorCount,
                fromBlockNumber: uint32(block.number)
            }));
        }
        
        emit OperatorCountChanged(newOperatorCount);
    }

    /**
     * @notice For a given operatorIndex, pop and return the last operatorId in the history
     * @dev The last entry's operatorId is updated to address(0)
     * @return The removed operatorId
     */
    function _popLastOperator(uint32 operatorIndex) internal returns (address) {
        // When we call this function, operatorIndex is the new count after decreasing
        // We want to get the operator at the previous last index, which is operatorIndex
        // since the count has already been decreased
        
        OperatorUpdate storage lastUpdate = _latestOperatorIndexUpdate(operatorIndex);
        address removedOperatorId = lastUpdate.operatorId;

        // Set the current operator id for this operatorIndex to 0
        _updateOperatorIndexHistory(operatorIndex, lastUpdate, address(0), OperatorStatus.NotRegistered);

        return removedOperatorId;
    }

    /**
     * @notice Assign an operator to an index and update the index history
     * @param operatorId operatorId of the operator to update
     * @param operatorIndex the latest index of that operator in the list of operators
     */ 
    function _assignOperatorToIndex(address operatorId, uint32 operatorIndex) internal {
        OperatorUpdate storage lastUpdate = _latestOperatorIndexUpdate(operatorIndex);

        _updateOperatorIndexHistory(operatorIndex, lastUpdate, operatorId, operators[operatorId].status);

        // Assign the operator to their new current operatorIndex
        currentOperatorIndex[operatorId] = operatorIndex;
        emit OperatorIndexUpdate(operatorId, operatorIndex);
    }

    /**
     * @notice Update `_operatorIndexHistory` with a new operator id for the current block
     * @dev If the lastUpdate was made in the this block, update the entry.
     * Otherwise, push a new historical entry.
     */
    function _updateOperatorIndexHistory(
        uint32 operatorIndex,
        OperatorUpdate storage lastUpdate,
        address newOperatorId,
        OperatorStatus status
    ) internal {
        if (lastUpdate.fromBlockNumber == uint32(block.number)) {
            lastUpdate.operatorId = newOperatorId;
            lastUpdate.status = status;
        } else {
            _operatorIndexHistory[operatorIndex].push(OperatorUpdate({
                operatorId: newOperatorId,
                status: status,
                fromBlockNumber: uint32(block.number)
            }));
        }
    }

    /// @notice Returns the most recent operator count update
    function _latestOperatorCountUpdate() internal view returns (OperatorCountUpdate storage) {
        uint256 historyLength = _operatorCountHistory.length;
        return _operatorCountHistory[historyLength - 1];
    }

    /// @notice Returns the most recent operator id update for an index
    /// @dev Reverts if the index has never been used (history length == 0)
    function _latestOperatorIndexUpdate(uint32 operatorIndex) internal view returns (OperatorUpdate storage) {
        uint256 historyLength = _operatorIndexHistory[operatorIndex].length;
        require(historyLength > 0, "No history for this index");
        return _operatorIndexHistory[operatorIndex][historyLength - 1];
    }

    /*******************************************************************************
                                 VIEW FUNCTIONS
    *******************************************************************************/

    /**
     * @dev Get the operator count at a specific block number
     * @param blockNumber Block number to query
     * @return Number of operators at the specified block
     */
    function getOperatorCountAtBlockNumber(uint256 blockNumber) public view returns (uint32) {
        if (blockNumber == block.number) {
            return _latestOperatorCountUpdate().numOperators;
        }

        // Find the operator count at the given block number
        for (uint256 i = _operatorCountHistory.length; i > 0; i--) {
            OperatorCountUpdate memory countUpdate = _operatorCountHistory[i - 1];
            
            if (countUpdate.fromBlockNumber <= blockNumber) {
                return countUpdate.numOperators;
            }
        }
        
        return 0; // Return 0 if no history found before the given block number
    }

    /**
     * @dev Get active operator at a specific index
     * @param index Index in the active operators array
     * @return Operator address
     */
    function getActiveOperatorAt(uint256 index) public view returns (address) {
        uint32 currentCount = _latestOperatorCountUpdate().numOperators;
        require(index < currentCount, "Index out of bounds");
        
        OperatorUpdate storage update = _latestOperatorIndexUpdate(uint32(index));
        require(update.operatorId != address(0), "No operator at this index");
        require(operators[update.operatorId].status == OperatorStatus.Registered, "Operator not registered");
        
        return update.operatorId;
    }
    
    /**
     * @dev Check if an address is an active operator
     * @param operator Address to check
     * @return True if the address is an active operator
     */
    function isActiveOperator(address operator) external view returns (bool) {
        return operators[operator].status == OperatorStatus.Registered;
    }
    
    /**
     * @dev Get the contract's ETH balance
     * @return Contract's ETH balance in wei
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Get the number of active operators
     * @return Number of active operators
     */
    function getActiveOperatorCount() external view returns (uint256) {
        return _latestOperatorCountUpdate().numOperators;
    }
    
    /**
     * @dev Get the operator at a specific index at a specific block number
     * @param index Index to query
     * @param blockNumber Block number to query
     * @return Address of the operator at the specified index and block
     */
    function getOperatorAtIndexAt(uint32 index, uint256 blockNumber) external view returns (address) {
        OperatorUpdate[] storage history = _operatorIndexHistory[index];
        
        if (history.length == 0) {
            return address(0);
        }
        
        // Loop backwards through history until we find an entry that precedes `blockNumber`
        for (uint256 i = history.length; i > 0; i--) {
            OperatorUpdate memory indexUpdate = history[i - 1];
            
            if (indexUpdate.fromBlockNumber <= blockNumber) {
                return indexUpdate.operatorId;
            }
        }
        
        return address(0);
    }
    
    /**
     * @dev Get an ordered list of active operators at the current block
     * @return Array of active operator addresses
     */
    function getOperatorList() external view returns (address[] memory) {
        uint32 operatorCount = _latestOperatorCountUpdate().numOperators;
        address[] memory operatorList = new address[](operatorCount);
        
        for (uint32 i = 0; i < operatorCount; i++) {
            OperatorUpdate storage update = _latestOperatorIndexUpdate(i);
            operatorList[i] = update.operatorId;
            require(
                operatorList[i] != address(0), 
                "OperatorRegistry.getOperatorList: operator does not exist"
            );
        }
        
        return operatorList;
    }
    
    /**
     * @dev Get an ordered list of active operators at a specific block number
     * @param blockNumber Block number to query
     * @return Array of active operator addresses at the specified block
     */
    function getOperatorListAtBlockNumber(uint256 blockNumber) external view returns (address[] memory) {
        uint32 operatorCount = getOperatorCountAtBlockNumber(blockNumber);
        address[] memory operatorList = new address[](operatorCount);
        
        // Find the operator at each index at the given block number
        for (uint32 i = 0; i < operatorCount; i++) {
            operatorList[i] = _operatorIdForIndexAtBlockNumber(i, uint32(blockNumber));
            require(
                operatorList[i] != address(0), 
                "OperatorRegistry.getOperatorListAtBlockNumber: operator does not exist at the given block number"
            );
        }
        
        return operatorList;
    }
    
    /**
     * @return operatorId at the given `operatorIndex` at the given `blockNumber`
     */
    function _operatorIdForIndexAtBlockNumber(
        uint32 operatorIndex, 
        uint32 blockNumber
    ) internal view returns(address) {
        uint256 historyLength = _operatorIndexHistory[operatorIndex].length;

        // Loop backward through _operatorIndexHistory until we find an entry that preceeds `blockNumber`
        for (uint256 i = historyLength; i > 0; i--) {
            OperatorUpdate memory operatorIndexUpdate = _operatorIndexHistory[operatorIndex][i - 1];

            if (operatorIndexUpdate.fromBlockNumber <= blockNumber) {
                return operatorIndexUpdate.operatorId;
            }
        }

        // We should only hit this if the operatorIndex was never used before blockNumber
        return address(0);
    }
}
