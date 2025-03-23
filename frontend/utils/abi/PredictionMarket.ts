export const PredictionMarketABI = [
    {
        type: "constructor",
        inputs: [],
        stateMutability: "nonpayable",
    },
    { type: "receive", stateMutability: "payable" },
    {
        type: "function",
        name: "FEE_DENOMINATOR",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "createMarket",
        inputs: [
            {
                name: "question",
                type: "string",
                internalType: "string",
            },
            {
                name: "details",
                type: "string",
                internalType: "string",
            },
            {
                name: "endTime",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "imageUrl",
                type: "string",
                internalType: "string",
            },
            {
                name: "resolverAddress",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "creationFee",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getMarket",
        inputs: [
            {
                name: "marketId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "markets",
        inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "nextMarketId",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
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
        name: "tradingFee",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
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
        name: "updateFees",
        inputs: [
            {
                name: "_creationFee",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_tradingFee",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "withdrawFees",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "event",
        name: "FeesUpdated",
        inputs: [
            {
                name: "creationFee",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "tradingFee",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "MarketCreated",
        inputs: [
            {
                name: "marketId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "market",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "question",
                type: "string",
                indexed: false,
                internalType: "string",
            },
            {
                name: "details",
                type: "string",
                indexed: false,
                internalType: "string",
            },
            {
                name: "imageUrl",
                type: "string",
                indexed: false,
                internalType: "string",
            },
            {
                name: "endTime",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "MarketResolved",
        inputs: [
            {
                name: "marketId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
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
