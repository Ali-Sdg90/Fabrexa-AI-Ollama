/**
 * Main configuration for Fabrexa AI Bot.
 * Loads environment variables and provides runtime configuration.
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env" });

function readNumber(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBoolean(name, fallback) {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) return fallback;
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
    return fallback;
}

function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}

// Telegram configuration
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set. Add it to your .env file.");
}

export const BOT_PRIVATE = readBoolean("BOT_PRIVATE", true);
export const OWNER_ID = Number(process.env.OWNER_ID?.trim());
if (BOT_PRIVATE && !Number.isInteger(OWNER_ID)) {
    throw new Error(
        "OWNER_ID must be a numeric Telegram user id when BOT_PRIVATE is true.",
    );
}
export const OWNER_USERNAME = (process.env.OWNER_USERNAME || "")
    .trim()
    .replace(/^@/, "");
if (BOT_PRIVATE && !/^[A-Za-z0-9_]{5,32}$/.test(OWNER_USERNAME)) {
    throw new Error(
        "OWNER_USERNAME must be a valid Telegram username when BOT_PRIVATE is true.",
    );
}

// Ollama configuration
export const OLLAMA_BASE_URL = trimTrailingSlash(
    process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434",
);
export const OLLAMA_CHAT_URL = `${OLLAMA_BASE_URL}/api/chat`;
export const OLLAMA_MODEL =
    process.env.OLLAMA_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    process.env.MODEL?.trim() ||
    "llama3.1";
export const OLLAMA_ANALYZER_MODEL =
    process.env.OLLAMA_ANALYZER_MODEL?.trim() || OLLAMA_MODEL;
export const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE?.trim() || "10m";
export const OLLAMA_NUM_CTX = readNumber("OLLAMA_NUM_CTX", 8192);
export const OLLAMA_TEMPERATURE = readNumber("OLLAMA_TEMPERATURE", 0.8);
export const OLLAMA_TOP_P = readNumber("OLLAMA_TOP_P", 0.9);
export const OLLAMA_MAX_TOKENS = readNumber("OLLAMA_MAX_TOKENS", 512);

// Logging configuration
export const LOG_LEVEL = process.env.LOG_LEVEL || "INFO";
export const LOG_MODE = (process.env.LOG_MODE || "normal").trim().toLowerCase();
export const IS_DEV_LOG_MODE = new Set([
    "dev",
    "development",
    "dev-mode",
    "debug",
    "verbose",
]).has(LOG_MODE);

// Chat memory configuration
export const CHAT_MEMORY_DIR = "chat_memory";
export const PERSONALITY_DIR = "personalities";
export const DEFAULT_PERSONALITY = "Friendly";
const configuredMemoryPersonalities =
    process.env.MEMORY_ENABLED_PERSONALITIES;
export const MEMORY_ENABLED_PERSONALITIES =
    configuredMemoryPersonalities === undefined
        ? ["Friendly", "Vent Girl"]
        : configuredMemoryPersonalities
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean);

// Request configuration. Local models can be slower than hosted APIs.
export const REQUEST_TIMEOUT = readNumber("REQUEST_TIMEOUT", 120000);
export const MAX_MESSAGE_LENGTH = 4096; // Telegram message limit
export const TELEGRAM_STREAM_EDIT_INTERVAL_MS = readNumber(
    "TELEGRAM_STREAM_EDIT_INTERVAL_MS",
    6000,
);
export const MEMORY_PROCESSOR_CRON =
    process.env.MEMORY_PROCESSOR_CRON?.trim() || "0 0 * * *";
export const MEMORY_PROCESSOR_TIMEZONE =
    process.env.MEMORY_PROCESSOR_TIMEZONE?.trim() || "Asia/Tehran";

export const PERSONALITY_INSTRUCTION =
    process.env.PERSONALITY_INSTRUCTION?.trim() ||
    "Your system message is not set. just response 'YOUR SYSTEM MESSAGE IS NOT SET' to every user message.";
