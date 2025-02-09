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

export interface UploadContent extends Content {
    content: string;
    identifier?: string;
}

export function isUploadContent(content: UploadContent): content is UploadContent {
    return typeof content.content === "string";
}

const uploadTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "content": "Hello, EigenDA! This is a test message.",
    "identifier": "0x1234567890abcdef"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested EigenDA upload:
- Content to upload
- (Optional) Identifier to use for upload
Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "UPLOAD_DATA",
    similes: [
        "UPLOAD_TO_EIGENDA",
        "UPLOAD_CONTENT",
        "UPLOAD_FILE",
        "STORE_DATA",
        "STORE_CONTENT",
        "STORE_FILE",
        "SAVE_DATA",
        "SAVE_CONTENT",
        "SAVE_FILE",
    ],
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        await validateEigenDAConfig(runtime);
        return true;
    },
    description: "Upload content to EigenDA",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting UPLOAD_DATA handler...");

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Compose upload context
        const uploadContext = composeContext({
            state,
            template: uploadTemplate,
        });

        // Generate upload content
        const content = await generateObjectDeprecated({
            runtime,
            context: uploadContext,
            modelClass: ModelClass.SMALL,
        });

        // Validate upload content
        if (!isUploadContent(content)) {
            console.error("Invalid content for UPLOAD_DATA action.");
            if (callback) {
                callback({
                    text: "Unable to process upload request. Invalid content provided.",
                    content: { error: "Invalid upload content" },
                });
            }
            return false;
        }

        if (content.content != null) {
            try {
                const client = getClient();

                // Get or create identifier if not provided
                let identifier: Uint8Array;
                if (content.identifier) {
                    // Convert hex string to bytes32 format
                    const cleanHex = content.identifier.replace('0x', '').padStart(64, '0');
                    identifier = new Uint8Array(Buffer.from(cleanHex, 'hex'));
                } else {
                    // Check for environment identifier
                    const envConfig = await validateEigenDAConfig(runtime);
                    if (envConfig.IDENTIFIER) {
                        const cleanHex = envConfig.IDENTIFIER.replace('0x', '').padStart(64, '0');
                        identifier = new Uint8Array(Buffer.from(cleanHex, 'hex'));
                    } else {
                        // Fall back to existing or new identifier
                        const identifiers = await client.getIdentifiers();
                        identifier = identifiers.length > 0
                            ? identifiers[0]
                            : await client.createIdentifier();
                    }
                }

                elizaLogger.log("Using identifier (hex):", Buffer.from(identifier).toString('hex'));

                // Check balance and top up if needed
                const balance = await client.getBalance(identifier);
                elizaLogger.log(`Current balance: ${balance} ETH`);

                // Top up if balance is too low (0.001 ETH)
                if (balance < 0.001) {
                    elizaLogger.log("Balance low, topping up with 0.001 ETH...");
                    const topupResult = await client.topupCredits(identifier, 0.001);
                    elizaLogger.log("Top-up transaction:", topupResult);

                    // Wait a bit for the transaction to be processed
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    // Check new balance
                    const newBalance = await client.getBalance(identifier);
                    elizaLogger.log(`New balance after top-up: ${newBalance} ETH`);
                }

                // Upload the content
                const uploadResult = await client.upload(content.content, identifier);

                elizaLogger.success(
                    `Successfully uploaded content. Job ID: ${uploadResult.job_id}`
                );
                if (callback) {
                    callback({
                        text: `Content uploaded successfully! Job ID: ${uploadResult.job_id}. You can check the status of your upload using this job ID.`,
                        content: uploadResult,
                    });
                }

                return true;
            } catch (error) {
                elizaLogger.error("Error uploading content:", error);
                if (callback) {
                    callback({
                        text: `Error uploading content: ${error.message}`,
                        content: { error: error.message },
                    });
                }
                return false;
            }
        } else {
            elizaLogger.log("No content provided to upload");
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Upload 'Hello, EigenDA!' to the network",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll upload that content to EigenDA for you.",
                    action: "UPLOAD_DATA",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Content uploaded successfully! Job ID: abc123def456. You can check the status of your upload using this job ID.",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Store this JSON data: {'name': 'Test', 'value': 123}",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll store that JSON data on EigenDA.",
                    action: "UPLOAD_DATA",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "JSON data uploaded successfully! Job ID: xyz789. You can check the status of your upload using this job ID.",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;