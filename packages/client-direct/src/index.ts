import {
    composeContext,
    elizaLogger,
    generateMessageResponse,
    generateText,
    ModelClass,
    ServiceType,
    settings,
    State,
    stringToUuid,
    UUID,
    type Client,
    type IAgentRuntime,
    type Plugin,
} from "@elizaos/core";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { createApiRouter } from "./api.ts";
import { createVerifiableLogApiRouter } from "./verifiable-log-api.ts";
import { aggregatorTemplate, decisionTemplate, queryTemplate, synthesisTemplate } from "./templates.ts";
import { ethers, EventLog } from "ethers";

import TaskRegistryJSON from "./TaskRegistry.json"
const TaskRegistryABI = TaskRegistryJSON.abi;

export class DirectClient {
    public app: express.Application;
    private agents: Map<string, IAgentRuntime>; // container management
    private server: any; // Store server instance
    private verifications: Map<string, any>; // Store for in-progress verifications
    public startAgent: Function; // Store startAgent functor
    public loadCharacterTryPath: Function; // Store loadCharacterTryPath functor
    public jsonToCharacter: Function; // Store jsonToCharacter functor

    runtime: IAgentRuntime;
    userId: UUID;
    roomId: UUID;

    constructor() {
        elizaLogger.log("DirectClient constructor");
        this.app = express();
        this.app.use(cors());
        this.agents = new Map();
        this.verifications = new Map(); // Initialize the verifications map

        this.app.use(bodyParser.json());

        const apiRouter = createApiRouter(this.agents, this);
        this.app.use(apiRouter);

        const apiLogRouter = createVerifiableLogApiRouter(this.agents);
        this.app.use(apiLogRouter);

        this.app.post("/:agentId/verify-claim", async (req, res) => {
            const claim = req.body.claim;
            const state = await this.runtime.composeState({
                content: { text: "" },
                userId: this.userId,
                roomId: this.roomId,
                agentId: this.runtime.agentId
            }, {
                agentName: this.runtime.character.name,
                claim,
            })

            const result = await blueRedAggregate(this.runtime, state);
            const attestation = await generateAttestation(this.runtime, JSON.stringify(result));
            res.json({ attestation, result });
        })

        this.app.post("/:agentId/verify-claim-frontend", async (req, res) => {
            const claim = req.body.claim;
            const state = await this.runtime.composeState({
                content: { text: "" },
                userId: this.userId,
                roomId: this.roomId,
                agentId: this.runtime.agentId
            }, {
                agentName: this.runtime.character.name,
                claim,
            })

            // Initialize the verification state
            const verificationId = stringToUuid(Date.now().toString());
            this.verifications.set(verificationId, {
                state,
                runtime: this.runtime,
                logs: [],
                completed: false,
                result: null,
                lastUpdated: Date.now()
            });

            // Start the verification process in the background
            this.runVerification(verificationId);

            // Return the verification ID immediately
            res.json({ verificationId });
        });

        this.app.get("/:agentId/verify-claim-frontend-status/:verificationId", (req, res) => {
            const verificationId = req.params.verificationId;
            const verification = this.verifications.get(verificationId);

            if (!verification) {
                res.status(404).send("Verification not found");
                return;
            }

            // Return the current status
            res.json({
                completed: verification.completed,
                logs: verification.logs,
                result: verification.result
            });

            // Clear logs after sending them
            verification.logs = [];
        });
    }

    // agent/src/index.ts:startAgent calls this
    public registerAgent(runtime: IAgentRuntime) {
        // register any plugin endpoints?
        // but once and only once
        this.agents.set(runtime.agentId, runtime);
    }

    public unregisterAgent(runtime: IAgentRuntime) {
        this.agents.delete(runtime.agentId);
    }

    public async start(port: number) {
        const runtime = Array.from(this.agents.values()).find(
            (a) => a.character.name.toLowerCase() === "truthseeker"
        );
        if (!runtime) {
            elizaLogger.error("Truthseeker runtime not found");
            return;
        }
        const roomId = stringToUuid("default-room");
        const userId = stringToUuid("user");
        await runtime.ensureConnection(userId, roomId, null, null, "direct");

        this.runtime = runtime;
        this.userId = userId;
        this.roomId = roomId;

        this.server = this.app.listen(port, () => {
            elizaLogger.success(
                `REST API bound to 0.0.0.0:${port}. If running locally, access it at http://localhost:${port}.`
            );
        });

        // Handle graceful shutdown
        const gracefulShutdown = () => {
            elizaLogger.log("Received shutdown signal, closing server...");
            this.server.close(() => {
                elizaLogger.success("Server closed successfully");
                process.exit(0);
            });

            // Force close after 5 seconds if server hasn't closed
            setTimeout(() => {
                elizaLogger.error(
                    "Could not close connections in time, forcefully shutting down"
                );
                process.exit(1);
            }, 5000);
        };

        // Handle different shutdown signals
        process.on("SIGTERM", gracefulShutdown);
        process.on("SIGINT", gracefulShutdown);

        const rpcUrl = runtime.getSetting("TRUTHSEEKER_WS_RPC_URL");
        const privateKey = runtime.getSetting("TRUTHSEEKER_OPERATOR_PRIVATE_KEY");
        const contractAddress = runtime.getSetting("TRUTHSEEKER_TASK_CONTRACT_ADDRESS");

        if (!rpcUrl || !privateKey || !contractAddress) {
            return;
        }
        const provider = new ethers.WebSocketProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const taskContract = new ethers.Contract(contractAddress, TaskRegistryABI, wallet);
        taskReceiver(runtime, provider, wallet, taskContract);
    }

    public async stop() {
        if (this.server) {
            this.server.close(() => {
                elizaLogger.success("Server stopped");
            });
        }
    }

    async runVerification(verificationId) {
        const verification = this.verifications.get(verificationId);
        if (!verification) return;

        const { state, runtime } = verification;

        // Log function that updates the verification state
        const logMessage = (team, message) => {
            elizaLogger.info(message);
            const current = this.verifications.get(verificationId);
            if (current) {
                current.logs.push(`[${team}] ${message}`);
                current.lastUpdated = Date.now();
                this.verifications.set(verificationId, current);
            }
        };

        try {
            const result = await blueRedAggregate(runtime, state, logMessage);
            verification.result = result;
            verification.completed = true;
        } catch (error) {
            verification.logs.push(`[final] Error: ${error.message}`);
            verification.completed = true;
        }

        this.cleanupVerification(verificationId);
    }

    cleanupVerification(verificationId: string) {
        setTimeout(() => {
            this.verifications.delete(verificationId);
        }, 5000)
    }
}

export const DirectClientInterface: Client = {
    name: 'direct',
    config: {},
    start: async (_runtime: IAgentRuntime) => {
        elizaLogger.log("DirectClientInterface start");
        const client = new DirectClient();
        const serverPort = Number.parseInt(settings.SERVER_PORT || "3000");
        client.start(serverPort);
        return client;
    },
    // stop: async (_runtime: IAgentRuntime, client?: Client) => {
    //     if (client instanceof DirectClient) {
    //         client.stop();
    //     }
    // },
};

const directPlugin: Plugin = {
    name: "direct",
    description: "Direct client",
    clients: [DirectClientInterface],
};
export default directPlugin;

async function blueRedAggregate(runtime: IAgentRuntime, state: State, logMessage: LogFunction = defaultLogFunction) {
    const { information: blueTeamInformation, decision: blueTeamDecision } = await doTeam(runtime, state, "blue", undefined, undefined, logMessage);
    const { information: redTeamInformation, decision: redTeamDecision } = await doTeam(runtime, state, "red", blueTeamInformation, blueTeamDecision, logMessage);
    return await aggregateTeams(runtime, state, blueTeamInformation, blueTeamDecision, redTeamInformation, redTeamDecision, logMessage);
}

async function doTeam(runtime: IAgentRuntime, state: State, team: "blue" | "red", prevTeamInformation?: string, prevTeamDecision?: any, logMessage: LogFunction = defaultLogFunction): Promise<{information: string, decision: any}> {
    // Generate queries
    const queryContext = composeContext({
        state,
        template: queryTemplate(team, prevTeamDecision ? (team == "blue" ? "red" : "blue") : null, prevTeamInformation, prevTeamDecision),
    });

    console.log(queryContext);

    const queries = (await generateMessageResponse({
        runtime: runtime,
        context: queryContext,
        modelClass: ModelClass.LARGE,
    }) as any).queries as string[];

    if (!queries) {
        throw new Error("Error: No queries generated");
    }

    logMessage(team, `Generated ${team} team queries: ${queries.join(', ')}`);

    const webSearchService = runtime.getService(ServiceType.WEB_SEARCH) as any;
    const availableProviders = Array.from(webSearchService.providers?.keys() || []);
    logMessage(team, `Available search providers: ${availableProviders.join(', ') || 'none'}`);

    // Get Results using all available providers
    logMessage(team, "Searching for information...");
    const synthesisResult = await doWebSearch(runtime, state, queries, team, webSearchService, logMessage);
    logMessage(team, `Completed ${team} team query searches`);

    // Reason
    state["queries"] = JSON.stringify(queries);
    state["synthesisResult"] = synthesisResult;

    logMessage(team, `Starting ${team} team decision making process`);
    let decisionTries = 0;

    let decision = null;
    while (decisionTries < 5) {
        const decisionContext = composeContext({
            state,
            template: decisionTemplate(team, prevTeamDecision ? (team == "blue" ? "red" : "blue") : null, prevTeamInformation, prevTeamDecision),
        });

        console.log(decisionContext);

        // Use type assertion to bypass TypeScript error
        let rawResponse = await generateMessageResponse({
            runtime: runtime,
            context: decisionContext,
            modelClass: ModelClass.LARGE,
            prefill: `  "decision": "`
        } as any);

        // Log the raw response to see what we're getting
        logMessage(team, `Raw ${team} team response: ${typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse)}`);

        // Try to extract JSON if the response isn't valid JSON
        decision = extractJsonFromResponse(rawResponse, team, logMessage);

        // Log the processed result
        logMessage(team, `${team} team decision: ${decision.decision}, confidence: ${decision.confidence}`);

        if (decision.additional_queries && (decision.additional_queries as string[]).length > 0) {
            logMessage(team, `${team} team decided to make additional queries: ${(decision.additional_queries as string[]).join(', ')}`);
            const additionalSynthesisResult = await doWebSearch(runtime, state, decision.additional_queries as string[], team, webSearchService, logMessage);
            state["queries"] += "\n" + JSON.stringify(decision.additional_queries);
            state["synthesisResult"] += "\n" + additionalSynthesisResult;
        } else {
            break;
        }
        decisionTries++;
    }

    logMessage(team, `${team} team decision completed`);

    // Update verification with the result
    return { decision, information: state["synthesisResult"] as string };
}

async function aggregateTeams(runtime: IAgentRuntime, state: State, blueTeamInformation: string, blueTeamDecision: any, redTeamInformation: string, redTeamDecision: any, logMessage: LogFunction = defaultLogFunction) {
    logMessage("final", `Starting final aggregation for claim: "${state.claim}"`);

    const aggregatorContext = composeContext({
        state,
        template: aggregatorTemplate(blueTeamDecision, blueTeamInformation, redTeamDecision, redTeamInformation),
    });

    console.log(aggregatorContext);

    logMessage("final", "Processing team decisions and evidence...");
    let rawResponse = await generateMessageResponse({
        runtime: runtime,
        context: aggregatorContext,
        modelClass: ModelClass.LARGE,
        prefill: `  "decision": "`
    } as any);

    // Log the raw response to see what we're getting
    logMessage("final", `Raw aggregator response: ${typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse)}`);

    // Try to extract JSON if the response isn't valid JSON
    const aggregationResult = extractJsonFromResponse(rawResponse, "final", logMessage);

    // Log the processed result
    logMessage("final", `Final decision: ${aggregationResult.decision}, confidence: ${aggregationResult.confidence}`);
    logMessage("final", `Full aggregation result: ${JSON.stringify(aggregationResult)}`);

    logMessage("final", "Claim verification completed successfully");
    return aggregationResult;
}

async function doWebSearch(runtime: IAgentRuntime, state: State, queries: string[], team: "blue" | "red", webSearchService: any, logMessage: LogFunction = defaultLogFunction): Promise<{query: string, text: string}[]> {
    let promises = [];
    for (const query of queries) {
        promises.push(new Promise(async (resolve, reject) => {
            try {
                logMessage(team, `Executing ${team} team query: "${query}"`);

                // Use all available providers
                const searchResponse = await webSearchService.search(query, {
                    tavily: {
                        includeAnswer: true,
                    },
                    twitter: {
                        count: 5,
                        mode: 'top'
                    }
                });

                logMessage(team, `Search completed for "${query}" using provider(s): ${
                    searchResponse.usedProviders && searchResponse.usedProviders.length > 0
                        ? searchResponse.usedProviders.join(', ')
                        : searchResponse.provider
                }`);

                elizaLogger.debug(`Search response details: provider=${searchResponse.provider}, usedProviders=${JSON.stringify(searchResponse.usedProviders || [])}`);

                if (searchResponse) {
                    // Handle combined results from multiple providers
                    if (searchResponse.provider === "all" && searchResponse.combinedResults) {
                        const providerNames = searchResponse.usedProviders.join(', ');
                        logMessage(team, `Got results from providers (${providerNames}) for "${query}"`);

                        resolve({
                            query,
                            text: (searchResponse.tavily?.answer ? `##### Result from tavily #####\n${searchResponse.tavily.answer}\n` : "") +
                                searchResponse.combinedResults.map(r =>
                                    `##### Result from ${r.source} | Title: ${r.title} | URL: ${r.url} #####\n${r.content}`
                                ).join("\n"),
                        });
                    }
                    // Handle Twitter-specific results
                    else if (searchResponse.provider === "twitter" && searchResponse.results?.length) {
                        logMessage(team, `Got ${searchResponse.results.length} tweets for "${query}"`);

                        resolve({
                            query,
                            text: searchResponse.results.map(tweet =>
                                `##### Tweet from ${tweet.metadata.name} (@${tweet.metadata.username}) | Likes: ${tweet.metadata.likes} | Retweets: ${tweet.metadata.retweets} | URL: ${tweet.url} #####\n${tweet.content}`
                            ).join("\n\n")
                        });
                    }
                    // Handle single provider results
                    else if (searchResponse.results?.length) {
                        logMessage(team, `Got results from ${searchResponse.provider} for "${query}" (${searchResponse.results.length} results)`);

                        resolve({
                            query,
                            text: (searchResponse.answer ? `##### Results #####\n${searchResponse.answer}\n` : "") +
                                searchResponse.results.map(r =>
                                    `${r.title} (url: ${r.url}): ${r.content || r.text}`
                                ).join("\n"),
                        });
                    }
                    else {
                        logMessage(team, `No relevant results found for "${query}"`);

                        resolve({
                            query,
                            text: "NO RESULTS FOUND",
                        });
                    }
                } else {
                    logMessage(team, `Search failed or returned no data for "${query}"`);

                    resolve({
                        query,
                        text: "NO RESULTS FOUND"
                    });
                }
            } catch (error) {
                logMessage(team, `Error during search for "${query}": ${error.message}`);

                resolve({
                    query,
                    text: "ERROR DURING SEARCH"
                });
            }
        }));
    }
    const results = await Promise.all(promises);
    const queriesResult = results.map(r => `## Query\n${r.query}\n## Result\n${r.text}`).join('\n\n\n\n');
    state["queriesResult"] = queriesResult;
    const synthesisContext = composeContext({
        state,
        template: synthesisTemplate(team, queriesResult)
    });

    console.log(synthesisContext);

    const synthesisResult = await generateText({
        runtime: runtime,
        context: synthesisContext,
        modelClass: ModelClass.LARGE,
    }) as any;
    return synthesisResult;
}

async function generateAttestation(runtime: IAgentRuntime, info: string) {
    const remoteAttestationProvider = runtime.getService("TEE" as ServiceType) as any;
    try {
        const attestation = await (remoteAttestationProvider as any).generateAttestation(info);
        return attestation;
    } catch (error) {
        if (runtime.getSetting("TEE_MODE") == "PRODUCTION") {
            throw error;
        }
        return {
            quote: "0x"
        };
    }
}

type LogFunction = (team: "blue" | "red" | "final", message: string) => void;
function defaultLogFunction(team: "blue" | "red" | "final", message: string) {
    elizaLogger.info(message);
}

// Helper function to extract JSON from potentially invalid responses
function extractJsonFromResponse(response: any, team: "blue" | "red" | "final", logMessage: LogFunction): any {
    // If it's already a valid object with the required fields, return it
    if (typeof response === 'object' && response !== null &&
        (response.decision || team === "blue" || team === "red")) {

        // Convert confidence to number if it's a string
        if (response.confidence && typeof response.confidence === 'string') {
            try {
                response.confidence = parseInt(response.confidence, 10);
                logMessage(team, `${team} team confidence was a string, converted to number: ${response.confidence}`);
            } catch (error) {
                response.confidence = 50;
                logMessage(team, `${team} team confidence could not be parsed as a number, assigned default value of 50`);
            }
        }

        // Ensure confidence score exists and is a number
        if (!response.confidence || typeof response.confidence !== 'number') {
            response.confidence = 50;
            response.confidence_explanation = "Default confidence score assigned as it was missing from the response.";
            logMessage(team, `${team} team response was missing confidence score, assigned default value of 50`);
        }

        return response;
    }

    // If it's a string, try to extract JSON from it
    if (typeof response === 'string') {
        try {
            // Look for JSON-like pattern in the string
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                const parsedJson = JSON.parse(jsonStr);

                logMessage(team, `${team} team response contained text outside JSON, extracted valid JSON`);

                // Convert confidence to number if it's a string
                if (parsedJson.confidence && typeof parsedJson.confidence === 'string') {
                    try {
                        parsedJson.confidence = parseInt(parsedJson.confidence, 10);
                        logMessage(team, `${team} team confidence was a string, converted to number: ${parsedJson.confidence}`);
                    } catch (error) {
                        parsedJson.confidence = 50;
                        logMessage(team, `${team} team confidence could not be parsed as a number, assigned default value of 50`);
                    }
                }

                // Ensure confidence score exists and is a number
                if (!parsedJson.confidence || typeof parsedJson.confidence !== 'number') {
                    parsedJson.confidence = 50;
                    parsedJson.confidence_explanation = "Default confidence score assigned as it was missing from the response.";
                    logMessage(team, `${team} team response was missing confidence score, assigned default value of 50`);
                }

                return parsedJson;
            }
        } catch (error) {
            logMessage(team, `Error parsing JSON from ${team} team response: ${error.message}`);
        }
    }

    // If we couldn't extract valid JSON, create a default response
    logMessage(team, `${team} team response was not valid JSON, creating default response`);

    return {
        decision: team === "final" ? "inconclusive" : "depends",
        reason: "Could not parse a valid response from the model output.",
        confidence: 50,
        confidence_explanation: "Default confidence due to parsing error in model response.",
        key_evidence: ["No valid evidence could be extracted from the model response."],
        strongest_evidence_for: team === "final" ? ["No valid evidence could be extracted."] : undefined,
        strongest_evidence_against: team === "final" ? ["No valid evidence could be extracted."] : undefined,
        information_gaps: team === "final" ? ["Complete model response could not be parsed as valid JSON."] : undefined
    };
}

enum ClaimVerificationResult {
    PENDING,
    TRUE,
    FALSE,
    DEPENDS,
    INCONCLUSIVE,
    TOO_EARLY
};

async function taskReceiver(runtime: IAgentRuntime, provider: ethers.WebSocketProvider, wallet: ethers.Wallet, taskContract: ethers.Contract) {
    let rtmr3;
    if (runtime.getSetting("TEE_MODE") != "PRODUCTION") {
        const quote = (await generateAttestation(runtime, "register")).quote;
        elizaLogger.info("Quote for registration:", quote);
        rtmr3 = quote.substring(2 + 1040, 2 + 1040 + 96);
    }

    const roomId = stringToUuid("default-room");
    const userId = stringToUuid("user");
    const taskSubmittedFilter = await taskContract.filters.TaskSubmitted(null, null, wallet.address, null).getTopicFilter()
    taskContract.on(taskSubmittedFilter, async (event: EventLog) => {
        const [taskId, user, operator, claim] = event.args;
        elizaLogger.info("Task received:", claim);

        const state = await runtime.composeState({
            content: { text: "" },
            userId,
            roomId,
            agentId: runtime.agentId
        }, {
            agentName: runtime.character.name,
            claim
        })
        const result = await blueRedAggregate(runtime, state);

        let verificationResult: ClaimVerificationResult;
        if (result.decision === "true") {
            verificationResult = ClaimVerificationResult.TRUE;
        } else if (result.decision === "false") {
            verificationResult = ClaimVerificationResult.FALSE;
        } else if (result.decision === "depends") {
            verificationResult = ClaimVerificationResult.DEPENDS;
        } else if (result.decision === "inconclusive") {
            verificationResult = ClaimVerificationResult.INCONCLUSIVE;
        } else if (result.decision === "too_early") {
            verificationResult = ClaimVerificationResult.TOO_EARLY;
        }
        let quote = (await generateAttestation(runtime, result.decision)).quote;
        if (!quote.startsWith("0x")) quote = "0x" + quote;
        if (rtmr3) {
            quote = quote.substring(0, 2 + 1040) + rtmr3 + quote.substring(2 + 1040 + 96);
        }
        await taskContract.submitVerificationResult(taskId, verificationResult, quote);
        elizaLogger.info(`Task ${taskId} (claim: ${claim}) verification result submitted: ${result.decision} | confidence: ${result.confidence} | reason: ${result.reason}`);
    });

    elizaLogger.info("Started task receiver");
}
