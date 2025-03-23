export const ResolverABI = [
    {
        type: "constructor",
        inputs: [
            {
                name: "_agent",
                type: "address",
                internalType: "address",
            },
        ],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "agent",
        inputs: [],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getResolutionRequest",
        inputs: [
            {
                name: "market",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [
            {
                name: "marketAddress",
                type: "address",
                internalType: "address",
            },
            { name: "url", type: "string", internalType: "string" },
            {
                name: "timestamp",
                type: "uint256",
                internalType: "uint256",
            },
            { name: "resolved", type: "bool", internalType: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "owner",
        inputs: [],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "renounceOwnership",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "requestResolution",
        inputs: [
            {
                name: "market",
                type: "address",
                internalType: "address",
            },
            { name: "url", type: "string", internalType: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "resolutionRequests",
        inputs: [{ name: "", type: "address", internalType: "address" }],
        outputs: [
            {
                name: "market",
                type: "address",
                internalType: "address",
            },
            { name: "url", type: "string", internalType: "string" },
            {
                name: "timestamp",
                type: "uint256",
                internalType: "uint256",
            },
            { name: "resolved", type: "bool", internalType: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "resolveMarket",
        inputs: [
            {
                name: "market",
                type: "address",
                internalType: "address",
            },
            { name: "result", type: "bool", internalType: "bool" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "transferOwnership",
        inputs: [
            {
                name: "newOwner",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "updateAgent",
        inputs: [
            {
                name: "newAgent",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "event",
        name: "AgentUpdated",
        inputs: [
            {
                name: "newAgent",
                type: "address",
                indexed: true,
                internalType: "address",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "OwnershipTransferred",
        inputs: [
            {
                name: "previousOwner",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "newOwner",
                type: "address",
                indexed: true,
                internalType: "address",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "ResolutionCompleted",
        inputs: [
            {
                name: "market",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "result",
                type: "bool",
                indexed: false,
                internalType: "bool",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "ResolutionRequested",
        inputs: [
            {
                name: "market",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "url",
                type: "string",
                indexed: false,
                internalType: "string",
            },
        ],
        anonymous: false,
    },
    {
        type: "error",
        name: "OwnableInvalidOwner",
        inputs: [
            {
                name: "owner",
                type: "address",
                internalType: "address",
            },
        ],
    },
    {
        type: "error",
        name: "OwnableUnauthorizedAccount",
        inputs: [
            {
                name: "account",
                type: "address",
                internalType: "address",
            },
        ],
    },
    {
        type: "error",
        name: "ReentrancyGuardReentrantCall",
        inputs: [],
    },
];
