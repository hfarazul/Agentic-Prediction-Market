#!/bin/bash

# Change to the directory where this script is located
cd "$(dirname "$0")"

source .env

# Start Anvil in the background
echo "Starting Anvil..."
anvil &
ANVIL_PID=$!

# Give Anvil a moment to start
sleep 2
cd ../../contracts

# Deploy Automata DCAP Attestation
echo "Deploying Automata DCAP Attestation..."
forge script script/DeployMockAutomata.sol:DeployMockAutomata --broadcast --rpc-url http://localhost:8545

# Deploy TaskRegistry
echo "Deploying TaskRegistry..."
forge script script/Deploy.sol:DeployTaskRegistry --broadcast --rpc-url http://localhost:8545

# Wait for user to press Ctrl+C to terminate
echo "Deployments complete. Press Ctrl+C to terminate Anvil..."
wait $ANVIL_PID

# Cleanup when Ctrl+C is pressed
trap "kill $ANVIL_PID 2>/dev/null" EXIT
