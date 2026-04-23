// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC8004Registry {
    function registerAgent(address owner, string calldata metadataURI) external returns (uint256 agentId);
    function getAgent(uint256 agentId) external view returns (address owner, string memory metadataURI, bool isActive);
    function getAgentByOwner(address owner) external view returns (uint256 agentId);
}
