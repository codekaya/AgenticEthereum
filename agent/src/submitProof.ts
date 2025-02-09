import {
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
    elizaLogger,
    composeContext,
    generateObjectDeprecated,
  } from "@elizaos/core";
  import { validateEigenDAConfig } from "../environment";
  import { getClient } from "../utils";
  
  // Define the content expected for a proof submission. Instead of a generic “content” string,
  // we require a field named "proof" that carries the proof data (e.g. a hex-encoded string).
  export interface SubmitProofContent extends Content {
    proof: string;
    identifier?: string;
  }
  
  export function isSubmitProofContent(content: SubmitProofContent): content is SubmitProofContent {
    return typeof content.proof === "string";
  }
  
  // Template prompt for extracting the required values from the conversation history.
  // (You can adjust the wording as needed for your application.)
  const submitProofTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
  
  Example response:
  \`\`\`json
  {
    "proof": "0xdeadbeefcafebabe...",
    "identifier": "0x1234567890abcdef"
  }
  \`\`\`
  
  {{recentMessages}}
  
  Given the recent messages, extract the following information for submitting a proof to AlignedLayer:
  - The proof data (as a hex or base64 string)
  - (Optional) An identifier to use for submission
  
  Respond with a JSON markdown block containing only the extracted values.`;
  
  export default {
    name: "SUBMIT_PROOF",
    similes: [
      "SUBMIT_PROOF_TO_ALIGNED",
      "SEND_PROOF",
      "PROOF_SUBMISSION",
      "SUBMIT_ZKPROOF",
      "SEND_ZKPROOF",
    ],
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
      // Ensure that the required environment configuration is present
      await validateEigenDAConfig(runtime);
      return true;
    },
    description: "Submit a ZK proof to the AlignedLayer network",
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      _options: { [key: string]: unknown },
      callback?: HandlerCallback
    ): Promise<boolean> => {
      elizaLogger.log("Starting SUBMIT_PROOF handler...");
  
      // Initialize or update state using the runtime helper functions.
      if (!state) {
        state = (await runtime.composeState(message)) as State;
      } else {
        state = await runtime.updateRecentMessageState(state);
      }
  
      // Compose the context for extracting proof submission values from recent messages.
      const submissionContext = composeContext({
        state,
        template: submitProofTemplate,
      });
  
      // Generate an object (from the recent messages) that should include the proof and (optionally) an identifier.
      const content = await generateObjectDeprecated({
        runtime,
        context: submissionContext,
        modelClass: ModelClass.SMALL,
      });
  
      // Validate that the extracted content contains a proof.
      if (!isSubmitProofContent(content)) {
        console.error("Invalid content for SUBMIT_PROOF action.");
        if (callback) {
          callback({
            text: "Unable to process proof submission request. Invalid content provided.",
            content: { error: "Invalid proof submission content" },
          });
        }
        return false;
      }
  
      if (content.proof != null) {
        try {
          const client = getClient();
  
          // Determine the identifier (a bytes32 value) to use for the submission.
          // Either use the one provided by the user or fall back to an environment-provided or new identifier.
          let identifier: Uint8Array;
          if (content.identifier) {
            // Convert hex string to a 32-byte value (padded if necessary)
            const cleanHex = content.identifier.replace("0x", "").padStart(64, "0");
            identifier = new Uint8Array(Buffer.from(cleanHex, "hex"));
          } else {
            // Check if the environment config provides an identifier.
            const envConfig = await validateEigenDAConfig(runtime);
            if (envConfig.IDENTIFIER) {
              const cleanHex = envConfig.IDENTIFIER.replace("0x", "").padStart(64, "0");
              identifier = new Uint8Array(Buffer.from(cleanHex, "hex"));
            } else {
              // Fall back to an existing identifier or create a new one via the client.
              const identifiers = await client.getIdentifiers();
              identifier = identifiers.length > 0 ? identifiers[0] : await client.createIdentifier();
            }
          }
  
          elizaLogger.log("Using identifier (hex):", Buffer.from(identifier).toString("hex"));
  
          // Check the current balance/credits associated with this identifier.
          const balance = await client.getBalance(identifier);
          elizaLogger.log(`Current balance: ${balance} ETH`);
  
          // Proof submission may require a higher balance (for example, 0.004 ETH).
          if (balance < 0.004) {
            elizaLogger.log("Balance low, topping up with 0.004 ETH...");
            const topupResult = await client.topupCredits(identifier, 0.004);
            elizaLogger.log("Top-up transaction:", topupResult);
  
            // Pause briefly to allow for processing.
            await new Promise((resolve) => setTimeout(resolve, 5000));
  
            // Check the new balance.
            const newBalance = await client.getBalance(identifier);
            elizaLogger.log(`New balance after top-up: ${newBalance} ETH`);
          }
  
          // Submit the proof using a client API. (Under the hood, this might mirror the Rust code’s
          // submission call that sends the proof along with any commitments, fees, etc.)
          elizaLogger.log("Submitting proof to AlignedLayer...");
          const submissionResult = await client.submitProof(content.proof, identifier);
  
          elizaLogger.success(`Proof submitted successfully. Job ID: ${submissionResult.job_id}`);
          if (callback) {
            callback({
              text: `Proof submitted successfully! Job ID: ${submissionResult.job_id}. You can check the status of your submission using this job ID.`,
              content: submissionResult,
            });
          }
  
          return true;
        } catch (error: any) {
          elizaLogger.error("Error submitting proof:", error);
          if (callback) {
            callback({
              text: `Error submitting proof: ${error.message}`,
              content: { error: error.message },
            });
          }
          return false;
        }
      } else {
        elizaLogger.log("No proof provided for submission");
        return false;
      }
    },
  
    examples: [
      [
        {
          user: "{{user1}}",
          content: {
            text: "Submit this proof: 0xdeadbeefcafebabe...",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "I'll submit that proof to AlignedLayer for you.",
            action: "SUBMIT_PROOF",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "Proof submitted successfully! Job ID: abc123def456. You can check the status of your submission using this job ID.",
          },
        },
      ],
      [
        {
          user: "{{user1}}",
          content: {
            text: "Send my zk-proof to the network. Use identifier 0x1234567890abcdef.",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "I'll submit your zk-proof to AlignedLayer.",
            action: "SUBMIT_PROOF",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "Proof submitted successfully! Job ID: xyz789. You can check the status of your submission using this job ID.",
          },
        },
      ],
    ] as ActionExample[][],
  } as Action;
  