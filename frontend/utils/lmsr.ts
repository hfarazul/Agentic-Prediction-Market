/**
 * LMSR (Logarithmic Market Scoring Rule) Implementation
 * This provides liquidity for prediction markets and calculates fair prices
 * based on the quantity of shares in the market.
 */

// The liquidity parameter - controls price sensitivity
// Higher values = less price movement for same trading volume
export const calculateLiquidity = (marketVolume: number): number => {
  // Start with a minimum liquidity of 10
  const minLiquidity = 10;

  // Scale liquidity with market volume, but keep it reasonable
  // We use log scale to avoid extreme values
  if (marketVolume <= 0) return minLiquidity;

  return minLiquidity + Math.log10(1 + marketVolume) * 10;
};

// Calculate the cost function for a given set of quantities
export const calculateCost = (quantities: number[], liquidity: number): number => {
  if (quantities.length === 0) return 0;

  // LMSR cost function: b * log(sum(e^(q_i/b)))
  const sumExp = quantities.reduce((sum, qi) => {
    return sum + Math.exp(qi / liquidity);
  }, 0);

  return liquidity * Math.log(sumExp);
};

// Calculate price for outcome i given all quantities
export const calculatePrice = (
  outcomeIndex: number,
  quantities: number[],
  liquidity: number
): number => {
  if (quantities.length === 0) return 0;

  // LMSR price function for outcome i: e^(q_i/b) / sum(e^(q_j/b))
  const numerator = Math.exp(quantities[outcomeIndex] / liquidity);

  const denominator = quantities.reduce((sum, qj) => {
    return sum + Math.exp(qj / liquidity);
  }, 0);

  return numerator / denominator;
};

// Calculate the cost to buy shares of a specific outcome
export const calculateCostToBuy = (
  outcomeIndex: number,
  sharesToBuy: number,
  quantities: number[],
  liquidity: number
): number => {
  // Current cost
  const currentCost = calculateCost(quantities, liquidity);

  // Create a new quantities array with the added shares
  const newQuantities = [...quantities];
  newQuantities[outcomeIndex] += sharesToBuy;

  // New cost after buying shares
  const newCost = calculateCost(newQuantities, liquidity);

  // Return the difference (cost to buy)
  return newCost - currentCost;
};

// Calculate the number of shares to buy with a given amount of money
export const calculateSharesToBuy = (
  outcomeIndex: number,
  amountToSpend: number,
  quantities: number[],
  liquidity: number,
  precision: number = 0.001
): number => {
  // Binary search to find the right number of shares
  let low = 0;
  let high = amountToSpend * 1000; // Arbitrary high starting point
  let shares = 0;

  while (high - low > precision) {
    const mid = (high + low) / 2;
    const cost = calculateCostToBuy(outcomeIndex, mid, quantities, liquidity);

    if (cost <= amountToSpend) {
      shares = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  return Math.floor(shares); // Round down to be conservative
};

// Initialize a market with equal probabilities
export const initializeMarket = (
  numOutcomes: number,
  initialLiquidity: number
): number[] => {
  // All outcomes start with equal quantities
  // For a binary market with 50/50 odds, both start at 0
  return Array(numOutcomes).fill(0);
};

// Convert from raw price to display percentage
export const priceToPercent = (price: number): number => {
  return Math.round(price * 100);
};

// Format price to display (e.g., "0.75¢" for 75%)
export const formatPrice = (price: number): string => {
  return (price).toFixed(2);
};
