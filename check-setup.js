#!/usr/bin/env node

import fs from "fs";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config({ path: ".env" });

const checks = [];

function addCheck(name, ok, detail) {
    checks.push({ name, ok, detail });
}

function commandVersion(command, args = ["--version"]) {
    try {
        return execFileSync(command, args, {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

addCheck(".env file", fs.existsSync(".env"), ".env exists");

const nodeVersion = commandVersion("node");
addCheck("Node.js", Boolean(nodeVersion), nodeVersion || "node not found");

const npmVersion =
    commandVersion(npmCommand) ||
    (process.env.npm_execpath ? "available through npm" : null);
addCheck("npm", Boolean(npmVersion), npmVersion || "npm not found");

const ollamaVersion = commandVersion("ollama");
addCheck(
    "Ollama CLI",
    Boolean(ollamaVersion),
    ollamaVersion || "ollama command not found; install Ollama if needed",
);

addCheck(
    "TELEGRAM_BOT_TOKEN",
    Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    process.env.TELEGRAM_BOT_TOKEN ? "set" : "missing",
);

const ownerId = Number(process.env.OWNER_ID);
const botPrivate = !["0", "false", "no", "off"].includes(
    (process.env.BOT_PRIVATE || "true").trim().toLowerCase(),
);
addCheck(
    "OWNER_ID",
    !botPrivate || Number.isInteger(ownerId),
    Number.isInteger(ownerId)
        ? String(ownerId)
        : botPrivate
          ? "missing or not numeric"
          : "not required in public mode",
);
const ownerUsername = (process.env.OWNER_USERNAME || "")
    .trim()
    .replace(/^@/, "");
const ownerUsernameValid = /^[A-Za-z0-9_]{5,32}$/.test(ownerUsername);
addCheck(
    "OWNER_USERNAME",
    !botPrivate || ownerUsernameValid,
    ownerUsernameValid
        ? `@${ownerUsername}`
        : botPrivate
          ? "missing or invalid"
          : "not required in public mode",
);
addCheck("Bot access", true, botPrivate ? "private" : "public");

const model =
    process.env.OLLAMA_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    process.env.MODEL?.trim() ||
    "llama3.1";
addCheck("Ollama model", Boolean(model), model);

const logMode = (process.env.LOG_MODE || "normal").trim();
addCheck("Log mode", Boolean(logMode), logMode);

const streamEditInterval = Number(
    process.env.TELEGRAM_STREAM_EDIT_INTERVAL_MS || 6000,
);
addCheck(
    "Telegram stream edit interval",
    Number.isFinite(streamEditInterval) && streamEditInterval > 0,
    `${streamEditInterval || "invalid"}ms`,
);

const historyMaxMessages = Number(
    process.env.CHAT_HISTORY_MAX_MESSAGES || 24,
);
const historyMaxTokens = Number(process.env.CHAT_HISTORY_MAX_TOKENS || 4096);
const minResponseWords = Number(
    process.env.OLLAMA_MIN_RESPONSE_WORDS ?? 250,
);
const maxContinuations = Number(
    process.env.OLLAMA_MAX_CONTINUATIONS ?? 2,
);
addCheck(
    "Minimum response length",
    Number.isInteger(minResponseWords) && minResponseWords >= 0,
    minResponseWords === 0
        ? "disabled"
        : `${minResponseWords || "invalid"} words`,
);
addCheck(
    "Automatic response continuations",
    Number.isInteger(maxContinuations) && maxContinuations >= 0,
    `${Number.isFinite(maxContinuations) ? maxContinuations : "invalid"} maximum`,
);
addCheck(
    "Conversation history message limit",
    Number.isInteger(historyMaxMessages) && historyMaxMessages > 0,
    `${historyMaxMessages || "invalid"} messages`,
);
addCheck(
    "Conversation history token budget",
    Number.isInteger(historyMaxTokens) && historyMaxTokens > 0,
    `${historyMaxTokens || "invalid"} approximate tokens`,
);

const memoryProcessorCron = process.env.MEMORY_PROCESSOR_CRON || "0 0 * * *";
const memoryProcessorTimezone =
    process.env.MEMORY_PROCESSOR_TIMEZONE || "Asia/Tehran";
addCheck(
    "Memory processor cron",
    cron.validate(memoryProcessorCron),
    `${memoryProcessorCron} (${memoryProcessorTimezone})`,
);

const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(
    /\/+$/,
    "",
);

try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
    });
    const data = await response.json();
    const installedModels = Array.isArray(data.models)
        ? data.models.map((entry) => entry.name)
        : [];
    const modelInstalled =
        installedModels.includes(model) ||
        (!model.includes(":") && installedModels.includes(`${model}:latest`));

    addCheck("Ollama server", response.ok, ollamaBaseUrl);
    addCheck(
        "Configured model installed",
        modelInstalled,
        modelInstalled
            ? model
            : `missing ${model}; installed: ${installedModels.join(", ") || "none"}`,
    );
} catch (error) {
    addCheck(
        "Ollama server",
        false,
        `${ollamaBaseUrl} is not reachable (${error.message})`,
    );
}

console.log("\nFabrexa AI setup check\n");
for (const check of checks) {
    console.log(`${check.ok ? "OK " : "ERR"} ${check.name}: ${check.detail}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
    console.log("\nFix the ERR items above before starting the bot.");
    process.exit(1);
}

console.log("\nSetup looks ready. Make sure Ollama is running before npm start.");
