#!/bin/bash

# Check if claim argument is provided
if [ $# -eq 0 ]; then
    echo "Please provide a claim argument"
    exit 1
fi

escape() {
    echo "$1" | sed 's/"/\\"/g'
}

# Get the claim argument
claim=$(escape "$1")

echo "Running verification"
echo "================================================"

response=$(curl 'http://localhost:3000/truthseeker/verify-claim' \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    --data-raw "{\"team\":\"blue\", \"claim\":\"$claim\"}")

echo "$response"
