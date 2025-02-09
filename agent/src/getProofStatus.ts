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

export interface StatusContent extends Content {
    jobId: string;
}

export function isStatusContent(content: StatusContent): content is StatusContent {
    return typeof content.jobId === "string";
}

const statusTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "jobId": "abc123def456"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested EigenDA status check:
- Job ID to check status for

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "GET_STATUS",
    similes: [
        "CHECK_STATUS",
        "GET_JOB_STATUS",
        "CHECK_JOB_STATUS",
        "GET_UPLOAD_STATUS",
        "CHECK_UPLOAD_STATUS",
        "GET_EIGENDA_STATUS",
        "CHECK_EIGENDA_STATUS",
    ],
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        await validateEigenDAConfig(runtime);
        return true;
    },
    description: "Check the status of an EigenDA upload job. Gives out the status, request ID and blob info.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting GET_STATUS handler...");

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Compose status context
        const statusContext = composeContext({
            state,
            template: statusTemplate,
        });

        // Generate status content
        const content = await generateObjectDeprecated({
            runtime,
            context: statusContext,
            modelClass: ModelClass.SMALL,
        });

        // Validate status content
        if (!isStatusContent(content)) {
            console.error("Invalid content for GET_STATUS action.");
            if (callback) {
                callback({
                    text: "Unable to process status request. Invalid content provided.",
                    content: { error: "Invalid status content" },
                });
            }
            return false;
        }

        if (content.jobId != null) {
            try {
                const client = getClient();
                const status = await client.getStatus(content.jobId);
                const requestId = status.request_id;
                const blobInfo = status.blob_info;
                elizaLogger.log(`Request ID: ${requestId}, Blob Info: ${blobInfo}`);
                elizaLogger.success(
                    `Successfully retrieved status for job ${content.jobId}: ${JSON.stringify(status)}`
                );
                if (callback) {
                    callback({
                        text: `Current status for job ${content.jobId}: ${status.status}${status.error ? `. Error: ${status.error}` : ''} \n You can also track it with Request ID: ${status.request_id}`,
                        content: status,
                    });
                }

                return true;
            } catch (error) {
                elizaLogger.error("Error checking status:", error);
                if (callback) {
                    callback({
                        text: `Error checking status: ${error.message}`,
                        content: { error: error.message },
                    });
                }
                return false;
            }
        } else {
            elizaLogger.log("No job ID provided to check status");
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Check the status of job abc123def456",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the status of that job for you.",
                    action: "GET_STATUS",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "The status of job abc123def456 is COMPLETED, Request ID: abc123def456",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the status of my upload with job ID xyz789?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the status of your upload.",
                    action: "GET_STATUS",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "The status of job xyz789 is PROCESSING, Request ID: abc123def456",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the Request ID for my upload with job ID xyz789?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the request ID for your upload.",
                    action: "GET_STATUS",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "The request ID for job xyz789 is abc123def456",
                },
            },
        ]
    ] as ActionExample[][],
} as Action;
