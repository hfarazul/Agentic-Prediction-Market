// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Market.sol";

contract Resolver is Ownable, ReentrancyGuard {
    struct ResolutionRequest {
        address market;
        string url;
        uint256 timestamp;
        bool resolved;
    }

    mapping(address => ResolutionRequest) public resolutionRequests;
    address public agent;

    event ResolutionRequested(address indexed market, string url);
    event ResolutionCompleted(address indexed market, bool result);
    event AgentUpdated(address indexed newAgent);

    constructor(address _agent) Ownable(msg.sender) {
        agent = _agent;
    }

    function requestResolution(address market, string memory url) external {
        require(
            Market(payable(market)).resolverAddress() == address(this),
            "Invalid market"
        );
        require(!resolutionRequests[market].resolved, "Already resolved");

        resolutionRequests[market] = ResolutionRequest({
            market: market,
            url: url,
            timestamp: block.timestamp,
            resolved: false
        });

        emit ResolutionRequested(market, url);
    }

    function resolveMarket(address market, bool result) external {
        require(msg.sender == agent, "Only agent can resolve");
        require(!resolutionRequests[market].resolved, "Already resolved");

        Market(payable(market)).resolve(result);
        resolutionRequests[market].resolved = true;

        emit ResolutionCompleted(market, result);
    }

    function updateAgent(address newAgent) external onlyOwner {
        require(newAgent != address(0), "Invalid agent address");
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    function getResolutionRequest(
        address market
    )
        external
        view
        returns (
            address marketAddress,
            string memory url,
            uint256 timestamp,
            bool resolved
        )
    {
        ResolutionRequest memory request = resolutionRequests[market];
        return (
            request.market,
            request.url,
            request.timestamp,
            request.resolved
        );
    }
}
