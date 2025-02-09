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
  
  // The expected content interface now represents the proof status check request.
  // We use the field "jobId" to specify the proof submission job ID.
  export interface ProofStatusContent extends Content {
    jobId: string;
  }
  
  export function isProofStatusContent(
    content: ProofStatusContent
  ): content is ProofStatusContent {
    return typeof content.jobId === "string";
  }
  
  const proofStatusTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
  
  Example response:
  \`\`\`json
  {
    "jobId": "abc123def456"
  }
  \`\`\`
  
  {{recentMessages}}
  
  Given the recent messages, extract the following information about the requested proof submission status check:
  - Job ID for the proof submission
  
  Respond with a JSON markdown block containing only the extracted values.`;
  
  export default {
    name: "GET_PROOF_STATUS",
    similes: [
      "CHECK_PROOF_STATUS",
      "GET_PROOF_JOB_STATUS",
      "CHECK_PROOF_JOB_STATUS",
      "GET_PROOF_SUBMISSION_STATUS",
      "CHECK_PROOF_SUBMISSION_STATUS"
    ],
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
      await validateEigenDAConfig(runtime);
      return true;
    },
    description:
      "Check the status of a proof submission. Provides details such as the current status, request ID, and any additional proof submission information.",
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      _options: { [key: string]: unknown },
      callback?: HandlerCallback
    ): Promise<boolean> => {
      elizaLogger.log("Starting GET_PROOF_STATUS handler...");
  
      // Initialize or update the conversation state.
      if (!state) {
        state = (await runtime.composeState(message)) as State;
      } else {
        state = await runtime.updateRecentMessageState(state);
      }
  
      // Compose the context for extracting proof status request details.
      const statusContext = composeContext({
        state,
        template: proofStatusTemplate,
      });
  
      // Generate the content object from recent messages.
      const content = await generateObjectDeprecated({
        runtime,
        context: statusContext,
        modelClass: ModelClass.SMALL,
      });
  
      // Validate the extracted content.
      if (!isProofStatusContent(content)) {
        console.error("Invalid content for GET_PROOF_STATUS action.");
        if (callback) {
          callback({
            text: "Unable to process proof status request. Invalid content provided.",
            content: { error: "Invalid proof status content" },
          });
        }
        return false;
      }
  
      if (content.jobId != null) {
        try {
          const client = getClient();
          // Retrieve the status of the proof submission.
          // (This method should mirror the behavior of your Rust proof submission flow.)
          const status = await client.getProofStatus(content.jobId);
          const requestId = status.request_id;
          // additional_info might include extra details (for example, blob info or auxiliary data)
          const additionalInfo = status.additional_info;
          elizaLogger.log(`Request ID: ${requestId}, Additional Info: ${additionalInfo}`);
          elizaLogger.success(
            `Successfully retrieved status for proof submission job ${content.jobId}: ${JSON.stringify(status)}`
          );
          if (callback) {
            callback({
              text: `Current status for proof submission job ${content.jobId}: ${status.status}${
                status.error ? `. Error: ${status.error}` : ""
              }\nYou can also track it with Request ID: ${status.request_id}`,
              content: status,
            });
          }
  
          return true;
        } catch (error: any) {
          elizaLogger.error("Error checking proof submission status:", error);
          if (callback) {
            callback({
              text: `Error checking proof submission status: ${error.message}`,
              content: { error: error.message },
            });
          }
          return false;
        }
      } else {
        elizaLogger.log("No job ID provided to check proof submission status");
        return false;
      }
    },
  
    examples: [
      [
        {
          user: "{{user1}}",
          content: {
            text: "Check the status of my proof submission job abc123def456",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "I'll check the status of your proof submission job.",
            action: "GET_PROOF_STATUS",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "The status of proof submission job abc123def456 is COMPLETED, Request ID: abc123def456",
          },
        },
      ],
      [
        {
          user: "{{user1}}",
          content: {
            text: "What's the status of my proof submission with job ID xyz789?",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "I'll check the status of your proof submission.",
            action: "GET_PROOF_STATUS",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "The status of proof submission job xyz789 is PROCESSING, Request ID: def789ghi012",
          },
        },
      ],
      [
        {
          user: "{{user1}}",
          content: {
            text: "What's the Request ID for my proof submission with job ID xyz789?",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "I'll check the Request ID for your proof submission.",
            action: "GET_PROOF_STATUS",
          },
        },
        {
          user: "{{agent}}",
          content: {
            text: "The Request ID for proof submission job xyz789 is def789ghi012",
          },
        },
      ]
    ] as ActionExample[][],
  } as Action;
  