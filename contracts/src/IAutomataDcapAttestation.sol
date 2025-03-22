// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAutomataDcapAttestation {
    function verifyAndAttestOnChain(bytes calldata rawQuote) external view returns (bool success, bytes memory output);
}

contract MockAutomataDcapAttestation is IAutomataDcapAttestation {
    function verifyAndAttestOnChain(bytes calldata rawQuote) external pure returns (bool success, bytes memory output) {
        return (true, abi.encode(rawQuote));
    }
}
