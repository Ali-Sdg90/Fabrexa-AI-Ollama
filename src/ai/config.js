/**
 * AI client configuration for local Ollama.
 */

export {
    IS_DEV_LOG_MODE,
    OLLAMA_CHAT_URL,
    OLLAMA_MODEL,
    OLLAMA_ANALYZER_MODEL,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_NUM_CTX,
    OLLAMA_TEMPERATURE,
    OLLAMA_TOP_P,
    OLLAMA_MAX_TOKENS,
    OLLAMA_MIN_RESPONSE_WORDS,
    OLLAMA_MAX_CONTINUATIONS,
    CHAT_HISTORY_MAX_MESSAGES,
    CHAT_HISTORY_MAX_TOKENS,
    PERSONALITY_INSTRUCTION,
} from "../config/index.js";

// Backup system message if personality loading fails.
export const SYSTEM_MESSAGE = `
There was a problem with personality selection. Tell the user that the selected personality could not be loaded.
`.trim();
