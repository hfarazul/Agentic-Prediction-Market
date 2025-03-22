const MIN_QUERIES = 3;
const MAX_QUERIES = 5;

export function queryTemplate(team: "blue" | "red", prevTeam?: "blue" | "red" | null, prevTeamInformation?: string, prevTeamDecision?: any) {
    const assumption = team == "blue" ? "true" : "false";
    const negativeAssumption = team == "blue" ? "false" : "true";

    const goal = team == "blue" ? "support and prove" : "debunk and disprove";
    const negativeGoal = team == "blue" ? "debunk and disprove" : "support and prove";

    return `# About {{agentName}}
{{bio}}
{{lore}}

# Claim
{{claim}}

# Task
IMPORTANT: This is a fact-checking exercise using a red team/blue team approach to thoroughly investigate claims from multiple perspectives.
As {{agentName}} on the ${team} team, your task is to generate search queries that could potentially ${goal} the claim.
For this exercise, you are temporarily assuming the claim is ${assumption} for your evidence gathering stage.

## Query Guidelines
1. Do not directly search for the claim. Instead search for facts and data points that could help you ${goal} the claim.
    - Instead of "did X happen?", search for specific details about X
    - Instead of "is Y true?", search for facts and statistics about Y
    - Instead of "was Z successful?", search for specific details about Z
2. Focus on facts and data points rather than opinions or general information
3. Prioritize authoritative sources (academic research, government data, expert consensus, official bodies, etc.)
4. Avoid leading or biased query formulations
5. If the claim mentions specific dates, past events, or future events, make sure to have queries that can help you verify the dates and timelines
6. Keep queries precise, targeted, and diverse in their approach to the topic.

` +
(prevTeam != null ? `
# Other Team's Findings and Decision
The ${prevTeam} team (who assumed the claim was ${negativeAssumption}) has already conducted their research.
Take their findings and decision into account to avoid duplication and identify information gaps so you can gather any missing information:

## Information They Gathered
${prevTeamInformation}

## Their Decision and Reasoning
Decision: ${prevTeamDecision.decision}
Reasoning: ${prevTeamDecision.reason}

` : '') +
`
# Instructions
Your response must be ONLY a JSON object with the following structure:
{
  "queries": [
    "specific query 1",
    "specific query 2",
    "specific query 3",
    ...
  ]
}

Requirements:
- Include ${MIN_QUERIES}-${MAX_QUERIES} diverse, specific queries
- Do not include any text outside the JSON object
`
}

export function decisionTemplate(team: "blue" | "red", prevTeam?: "blue" | "red" | null, prevTeamInformation?: string, prevTeamDecision?: any) {
    const assumption = team == "blue" ? "true" : "false";
    const negativeAssumption = team == "blue" ? "false" : "true";

    const goal = team == "blue" ? "support and prove" : "debunk and disprove";
    const negativeGoal = team == "blue" ? "debunk and disprove" : "support and prove";

    const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

    return `# About {{agentName}}
{{bio}}
{{lore}}

# Claim
{{claim}}

# Task
IMPORTANT: This is a fact-checking exercise using a red team/blue team approach to thoroughly investigate claims from multiple perspectives.
As {{agentName}} on the ${team} team, you initially approached this claim assuming it was ${assumption}. You've now gathered evidence through multiple search queries and must make an objective, evidence-based decision about the claim's validity.

IMPORTANT: Date Verification
Before making any decision, verify if the claim refers to future events:
1. The current date is: ${currentDate}
2. If the claim relies on ANYTHING in the future (after the current date), you MUST use the "too_early" decision
3. Do not attempt to predict future events or make assumptions about what will happen. Laws can change, people can be replaced, many things can happen.
    - Example: "Donald Trump can't run for president again" should be "too_early" even if he has already served two terms since laws can change. However "Based on current laws, Donald Trump can't run for president again" would be "true"

## Analytical Framework
1. Weigh CONFLICTING evidence fairly, noting strength of each position
2. Identify any GAPS in available information
3. Consider ALTERNATIVE interpretations of the evidence
4. Determine if the claim is SPECIFIC enough to be verified
5. Be willing to CHANGE your initial assumption based on evidence
6. Check if the claim references a FUTURE DATE or event that hasn't occurred yet

## Decision Criteria (Apply Strictly)
"True" - The claim is DEMONSTRABLY true based on high-quality evidence with minimal credible contradicting evidence.
"False" - The claim is DEMONSTRABLY false based on high-quality evidence with minimal credible contradicting evidence.
"Depends" - The claim's truth depends on specific context, definitions, or conditions that aren't specified in the original claim that would greatly affect your decision.
"Inconclusive" - Available evidence is insufficient, contradictory, or of inadequate quality to make a determination.
"Too_early" - The claim references a future date or event that hasn't occurred yet, making verification impossible at this time.

# Your Findings
## What you have queried so far:
{{queries}}

## Your findings from the queries so far:
{{synthesisResult}}

` +
(prevTeam != null ? `
# Other Team's Findings and Decision
The ${prevTeam} team (who assumed the claim was ${negativeAssumption}) has already conducted their research.
Consider their findings in your analysis:

## Information They Gathered
${prevTeamInformation}

## Their Decision and Reasoning
Decision: ${prevTeamDecision.decision}
Reasoning: ${prevTeamDecision.reason}

` : '') +
`
# Instructions
Your response must be ONLY a JSON object with the following fields:
- "decision": REQUIRED. MUST be one of "true|false|depends|inconclusive|too_early" (text)
- "reason": REQUIRED. MUST provide your detailed reasoning as to why you made that decision (text)
- "confidence": REQUIRED. MUST be a number between 0-100 (number)
- "key_evidence": REQUIRED. MUST list the specific pieces of evidence that heavily influenced your decision (array of text)
- "additional_queries": OPTIONAL. Include ONLY if there is a CRITICAL information gap. It should be an array of all the extra queries you need to run to gather the missing information. (array of text)

Notes:
- Make your decision solely based on available evidence, not what you believe "should" be true
- Be specific about which sources and data points influenced your decision
`;
}

export function aggregatorTemplate(blueTeamDecision: any, blueTeamInformation: string, redTeamDecision: any, redTeamInformation: string) {
  const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

  return `# About {{agentName}}
{{bio}}
{{lore}}

# Claim
{{claim}}

# Task
IMPORTANT: This is a fact-checking exercise using a red team (assuming the claim is false)/blue team (assuming the claim is true) approach to thoroughly investigate claims from multiple perspectives.
As {{agentName}} you are on neither team. You are the last judge who makes a decision based on both team's findings.
Your task is to take into consideration the information they gathered, their decision, their reasoning and their bias to make a final, objective determination about the claim.

IMPORTANT: Date Verification
Before making any decision, verify if the claim refers to future events:
1. The current date is: ${currentDate}
2. If the claim relies on ANYTHING in the future (after the current date), you MUST use the "too_early" decision
3. Do not attempt to predict future events or make assumptions about what will happen. Laws can change, people can be replaced, many things can happen.
    - Example: "Donald Trump can't run for president again" should be "too_early" even if he has already served two terms since laws can change. However "Based on current laws, Donald Trump can't run for president again" would be "true"

## Analytical Framework
1. COMPARE the quality, quantity, and relevance of evidence from both teams
2. IDENTIFY any biases in either team's approach or interpretation
3. EVALUATE the logical consistency of each team's reasoning
4. WEIGH contradictory evidence based on source reliability and methodological strength
5. CONSIDER what information might still be missing from both analyses
6. DETERMINE if either team overlooked important context or nuance
7. CHECK if the claim references a future date or event that hasn't occurred yet

## Decision Criteria (Apply Rigorously)
"True" - The claim is DEMONSTRABLY true based on preponderance of high-quality evidence with minimal credible contradicting evidence.
"False" - The claim is DEMONSTRABLY false based on preponderance of high-quality evidence with minimal credible contradicting evidence.
"Depends" - The claim's truth depends on specific context, definitions, or conditions that aren't specified in the original claim that would greatly affect your decision.
"Inconclusive" - Available evidence is insufficient, contradictory, or of inadequate quality to make a determination.
"Too_early" - The claim references a future date or event that hasn't occurred yet, making verification impossible at this time.

## Teams' Gathered Information and Decision
### Blue Team (Pro-Claim)
#### Information They Gathered
${blueTeamInformation}

#### Their Decision and Reasoning
Decision: ${blueTeamDecision.decision}
Reasoning: ${blueTeamDecision.reason}

### Red Team (Anti-Claim)
#### Information They Gathered
${redTeamInformation}

#### Their Decision and Reasoning
Decision: ${redTeamDecision.decision}
Reasoning: ${redTeamDecision.reason}

# Instructions
Your response must be ONLY a JSON object with the following fields:
- "decision": REQUIRED. MUST be one of "true|false|depends|inconclusive|too_early" (text)
- "reason": REQUIRED. MUST provide your detailed reasoning as to why you made that decision (text)
- "confidence": REQUIRED. MUST be a number between 0-100 (number)
- "key_evidence": REQUIRED. MUST list the specific pieces of evidence that heavily influenced your decision (array of text)
- "supporting_evidence": OPTIONAL. List of evidence that heavily supports the claim. (array of text)
- "contradictory_evidence": OPTIONAL. List of evidence that heavily contradicts the claim. (array of text)
- "information_gaps": OPTIONAL. List of missing information that would help resolve the claim. (array of text)
`;
}

export function synthesisTemplate(team: "blue" | "red", findings: any) {
  return `# About {{agentName}}
{{bio}}
{{lore}}

# Claim
{{claim}}

# Task
IMPORTANT: This is a fact-checking exercise using a red team (assuming the claim is false)/blue team (assuming the claim is true) approach to thoroughly investigate claims from multiple perspectives.
As {{agentName}} you are on neither team. Your goal is to synthesize the findings of the ${team} team from their queries for them.
PRESERVE all the important context, details, nuances and information that they'll need based on the claim.
Take their queries into account when synthesizing the findings so you can give them the most relevant information that they need and were looking for.
DO NOT ADD ANYTHING TO THE SYNTHESIS THAT IS NOT PRESENT IN THE FINDINGS.
The findings include the url of the source, so if you recognize a source that is usually a spreader of misinformation or for parodies or clickbait ignore its findings in the final synthesis.

# Special Source Handling
- For Twitter results: Consider the credibility of the account, verification status, and engagement metrics. Tweets from official accounts or verified experts may be more reliable than random users.
- For news sources: Consider the publication's reputation, whether it's mainstream or alternative, and if it has a known political bias.
- For academic sources: These are generally more reliable for factual information, especially peer-reviewed content.

# Queries + Findings
{{queriesResult}}

# Instructions
Your response must be just the result of the synthesis and nothing else.
`
}
