import { Action, IAgentRuntime } from "eliza";

// Example action that queries an EigenLayer AVS for token price data.
export const fetchTokenPriceAction: Action = {
  name: "FETCH_TOKEN_PRICE",
  similes: ["GET_PRICE", "TOKEN_PRICE", "MARKET_PRICE"],
  description: "Fetches the current token price from a decentralized data source via EigenLayer.",
  handler: async (runtime: IAgentRuntime, message, state, options): Promise<boolean> => {
    // Suppose you have a helper function that calls the AVS service:
    try {
      const token = options.token || "ETH";
      const priceData = await queryEigenLayerAVS(token);
      // Store the fetched data in the agent’s memory or directly respond.
      runtime.addMessage({ text: `The current price of ${token} is $${priceData.price}` });
      return true;
    } catch (error) {
      runtime.addMessage({ text: "Sorry, I couldn't fetch the token price at the moment." });
      return false;
    }
  },
};

// Mock helper function simulating an API call to your AVS service:
async function queryEigenLayerAVS(token: string): Promise<{ price: number }> {
  // Here you would implement REST or WebSocket calls to your AVS endpoint.
  // For the demo, we return a static value.
  return new Promise((resolve) => setTimeout(() => resolve({ price: 3000 }), 500));
}