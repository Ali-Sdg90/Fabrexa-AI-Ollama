/**
 * AI client for Fabrexa Bot.
 * Handles communication with a local Ollama server.
 */

import axios from "axios";
import {
    IS_DEV_LOG_MODE,
    OLLAMA_CHAT_URL,
    OLLAMA_MODEL,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_NUM_CTX,
    OLLAMA_TEMPERATURE,
    OLLAMA_TOP_P,
    OLLAMA_MAX_TOKENS,
    CHAT_HISTORY_MAX_MESSAGES,
    CHAT_HISTORY_MAX_TOKENS,
    SYSTEM_MESSAGE,
    PERSONALITY_INSTRUCTION,
} from "./config.js";
import { REQUEST_TIMEOUT } from "../config/index.js";

const MESSAGE_TOKEN_OVERHEAD = 4;
const CONTEXT_SAFETY_TOKENS = 256;

function logDev(label, value) {
    if (!IS_DEV_LOG_MODE) return;
    console.log(`\n🛠️  [DEV] ${label}`);
    if (typeof value === "string") {
        console.log(value);
        return;
    }
    console.dir(value, { depth: null, colors: true });
}

function getResponseChunk(data) {
    return data?.message?.content || data?.response || "";
}

export function estimateTokenCount(value) {
    const text = String(value || "");
    let asciiCharacters = 0;
    let nonAsciiCharacters = 0;

    for (const character of text) {
        if (character.codePointAt(0) <= 0x7f) {
            asciiCharacters += 1;
        } else {
            nonAsciiCharacters += 1;
        }
    }

    return Math.ceil(asciiCharacters / 4 + nonAsciiCharacters);
}

function estimateMessageTokens(message) {
    return estimateTokenCount(message?.content) + MESSAGE_TOKEN_OVERHEAD;
}

export function selectRecentHistory(
    historyMessages,
    maxMessages = CHAT_HISTORY_MAX_MESSAGES,
    tokenBudget = CHAT_HISTORY_MAX_TOKENS,
) {
    if (!Array.isArray(historyMessages) || maxMessages <= 0 || tokenBudget <= 0) {
        return [];
    }

    const validHistory = historyMessages
        .filter(
            (message) =>
                ["user", "assistant"].includes(message?.role) &&
                typeof message.content === "string" &&
                message.content.trim(),
        )
        .slice(-Math.floor(maxMessages));

    const selected = [];
    let usedTokens = 0;

    for (let index = validHistory.length - 1; index >= 0; index -= 1) {
        const message = validHistory[index];
        const messageTokens = estimateMessageTokens(message);
        if (usedTokens + messageTokens > tokenBudget) break;

        selected.unshift({
            role: message.role,
            content: message.content,
        });
        usedTokens += messageTokens;
    }

    // Avoid beginning the supplied context with a detached assistant reply.
    while (selected[0]?.role === "assistant") {
        selected.shift();
    }

    return selected;
}

class AIClient {
    constructor() {
        this.apiUrl = OLLAMA_CHAT_URL;
        this.model = OLLAMA_MODEL;
        this.systemMessage = SYSTEM_MESSAGE;
    }

    buildMessages(userMessage, personality, historyMessages, memoryContext) {
        const personalityPrompt = personality?.prompt
            ? `${PERSONALITY_INSTRUCTION}\n${personality.prompt}`
            : `${PERSONALITY_INSTRUCTION}\n${this.systemMessage}`;

        const systemContent = memoryContext
            ? `${personalityPrompt}

Long-term memory context:
${memoryContext}`
            : personalityPrompt;

        const messages = [
            {
                role: "system",
                content: systemContent,
            },
        ];

        const fixedTokenEstimate =
            estimateMessageTokens({ content: systemContent }) +
            estimateMessageTokens({ content: userMessage }) +
            OLLAMA_MAX_TOKENS +
            CONTEXT_SAFETY_TOKENS;
        const availableHistoryTokens = Math.max(
            0,
            Math.min(
                CHAT_HISTORY_MAX_TOKENS,
                OLLAMA_NUM_CTX - fixedTokenEstimate,
            ),
        );
        const recentHistory = selectRecentHistory(
            historyMessages,
            CHAT_HISTORY_MAX_MESSAGES,
            availableHistoryTokens,
        );
        for (const msg of recentHistory) {
            if (msg.role && msg.content) {
                messages.push({
                    role: msg.role,
                    content: msg.content,
                });
            }
        }

        messages.push({
            role: "user",
            content: userMessage,
        });

        return messages;
    }

    buildPayload(
        userMessage,
        personality,
        historyMessages,
        memoryContext,
        stream,
    ) {
        return {
            model: this.model,
            messages: this.buildMessages(
                userMessage,
                personality,
                historyMessages,
                memoryContext,
            ),
            stream,
            keep_alive: OLLAMA_KEEP_ALIVE,
            options: {
                temperature: OLLAMA_TEMPERATURE,
                top_p: OLLAMA_TOP_P,
                num_ctx: OLLAMA_NUM_CTX,
                num_predict: OLLAMA_MAX_TOKENS,
            },
        };
    }

    async chat(
        userMessage,
        personality = null,
        historyMessages = [],
        memoryContext = "",
    ) {
        try {
            const startedAt = Date.now();
            const payload = this.buildPayload(
                userMessage,
                personality,
                historyMessages,
                memoryContext,
                false,
            );

            logDev("Ollama chat request", {
                url: this.apiUrl,
                timeout: REQUEST_TIMEOUT,
                payload,
            });

            const response = await axios.post(this.apiUrl, payload, {
                timeout: REQUEST_TIMEOUT,
            });

            const messageContent = getResponseChunk(response.data);

            if (!messageContent.trim()) {
                console.warn("⚠️ Ollama returned an empty response.");
                return null;
            }

            console.log(
                `✅ Ollama response received from ${this.model} (${messageContent.length} chars, ${Date.now() - startedAt}ms)`,
            );
            logDev("Ollama chat response", {
                status: response.status,
                model: response.data?.model,
                done: response.data?.done,
                totalDuration: response.data?.total_duration,
                loadDuration: response.data?.load_duration,
                promptEvalCount: response.data?.prompt_eval_count,
                evalCount: response.data?.eval_count,
                evalDuration: response.data?.eval_duration,
            });
            return messageContent;
        } catch (error) {
            this.logOllamaError(error);
            return null;
        }
    }

    async chatStream(
        userMessage,
        personality = null,
        historyMessages = [],
        memoryContext = "",
        onProgress = null,
    ) {
        const startedAt = Date.now();
        const payload = this.buildPayload(
            userMessage,
            personality,
            historyMessages,
            memoryContext,
            true,
        );
        let fullContent = "";
        let finalMetadata = null;

        try {
            logDev("Ollama streaming chat request", {
                url: this.apiUrl,
                timeout: REQUEST_TIMEOUT,
                payload,
            });

            const response = await axios.post(this.apiUrl, payload, {
                timeout: REQUEST_TIMEOUT,
                responseType: "stream",
            });

            let buffer = "";

            for await (const chunk of response.data) {
                buffer += chunk.toString("utf8");
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    const data = JSON.parse(line);
                    const contentChunk = getResponseChunk(data);

                    if (contentChunk) {
                        fullContent += contentChunk;
                        if (typeof onProgress === "function") {
                            await onProgress(fullContent, data);
                        }
                    }

                    if (data.done) {
                        finalMetadata = data;
                    }
                }
            }

            if (buffer.trim()) {
                const data = JSON.parse(buffer);
                const contentChunk = getResponseChunk(data);
                if (contentChunk) {
                    fullContent += contentChunk;
                    if (typeof onProgress === "function") {
                        await onProgress(fullContent, data);
                    }
                }
                if (data.done) {
                    finalMetadata = data;
                }
            }

            if (!fullContent.trim()) {
                console.warn("⚠️ Ollama stream finished with an empty response.");
                return null;
            }

            console.log(
                `✅ Ollama stream complete from ${this.model} (${fullContent.length} chars, ${Date.now() - startedAt}ms)`,
            );
            logDev("Ollama streaming chat response", {
                elapsedMs: Date.now() - startedAt,
                model: finalMetadata?.model,
                done: finalMetadata?.done,
                totalDuration: finalMetadata?.total_duration,
                loadDuration: finalMetadata?.load_duration,
                promptEvalCount: finalMetadata?.prompt_eval_count,
                evalCount: finalMetadata?.eval_count,
                evalDuration: finalMetadata?.eval_duration,
            });

            return fullContent;
        } catch (error) {
            this.logOllamaError(error);
            return fullContent.trim() ? fullContent : null;
        }
    }

    logOllamaError(error) {
        console.error("\n❌ Error calling local Ollama:");
        console.error(`   🧩 Type: ${error.name}`);
        console.error(`   🔢 Code: ${error.code || "n/a"}`);
        console.error(`   💬 Message: ${error.message}`);

        if (error.code === "ECONNABORTED") {
            console.error(`   ⏱️  Request timed out after ${REQUEST_TIMEOUT}ms.`);
        } else if (error.response) {
            console.error(
                `   📡 Response: ${error.response.status} ${error.response.statusText}`,
            );
            console.error(`   📦 Body: ${JSON.stringify(error.response.data)}`);
        }

        console.log("\n💡 Ollama checks:");
        console.log("   1. Start Ollama: ollama serve");
        console.log(`   2. Pull the model: ollama pull ${this.model}`);
        console.log(`   3. Verify OLLAMA_BASE_URL: ${this.apiUrl}`);
        console.log("   4. Verify OLLAMA_MODEL in .env\n");
    }

    setSystemMessage(message) {
        this.systemMessage = message;
    }
}

export default AIClient;
