#!/bin/bash

# Change to the directory where this script is located
cd "$(dirname "$0")"

source .env

# Submit a task with 0.01 ETH submission fee
cast send $TASK_REGISTRY \
  "submitTask(string)" \
   "$1" \
  --rpc-url $RPC_URL \
  --private-key $USER_PRIVATE_KEY \
  --value 0.0001ether \
  --legacy
