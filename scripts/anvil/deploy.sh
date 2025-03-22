#!/bin/bash

# Change to the directory where this script is located
cd "$(dirname "$0")"

source .env

cd ../../contracts

echo "Deploying contracts network..."

# Run the Deploy.sol script
forge script ./script/Deploy.sol:DeployTaskRegistry \
    --rpc-url $RPC_URL \
    --broadcast \
    -vvv \
    --legacy

echo "Deployment completed!"
