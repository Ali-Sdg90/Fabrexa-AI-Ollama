/**
 * Memory module.
 * Manages chat sessions, personality state, short-term memory, and long-term
 * prompt memory.
 */

import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CHAT_MEMORY_DIR, DEFAULT_PERSONALITY } from "../config/index.js";
import { analyzeMessageImportance } from "./analyzer.js";
import { getMemoryService } from "./memoryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageRoot = path.join(__dirname, "..", "..", CHAT_MEMORY_DIR);

function getChatFolder(chatId) {
    return path.join(storageRoot, String(chatId));
}

function getMetaPath(chatId) {
    return path.join(getChatFolder(chatId), "meta.json");
}

function getSessionPath(chatId, sessionId) {
    return path.join(getChatFolder(chatId), `session_${sessionId}.txt`);
}

async function ensureChatFolder(chatId) {
    const chatFolder = getChatFolder(chatId);
    await fs.mkdir(chatFolder, { recursive: true });
    return chatFolder;
}

async function loadMeta(chatId) {
    await ensureChatFolder(chatId);
    const metaPath = getMetaPath(chatId);
    if (!existsSync(metaPath)) {
        return {
            currentSession: 1,
            personality: DEFAULT_PERSONALITY,
        };
    }

    try {
        const rawMeta = await fs.readFile(metaPath, "utf-8");
        return JSON.parse(rawMeta);
    } catch {
        return {
            currentSession: 1,
            personality: DEFAULT_PERSONALITY,
        };
    }
}

async function saveMeta(chatId, meta) {
    await ensureChatFolder(chatId);
    const metaPath = getMetaPath(chatId);
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

export async function getChatState(chatId) {
    return loadMeta(chatId);
}

export async function createNewChatSession(chatId) {
    const meta = await loadMeta(chatId);
    const nextSession = meta.currentSession + 1;
    meta.currentSession = nextSession;
    await saveMeta(chatId, meta);
    await ensureChatFolder(chatId);
    await fs.writeFile(
        getSessionPath(chatId, nextSession),
        `--- New chat session ${nextSession} ---\n`,
        "utf-8",
    );
    return meta;
}

export async function updateChatPersonality(chatId, personality) {
    const meta = await loadMeta(chatId);
    meta.personality = personality;
    await saveMeta(chatId, meta);
    return meta;
}

export async function appendChatMessage(
    chatId,
    role,
    message,
    personalityName = null,
) {
    const meta = await loadMeta(chatId);
    const sessionPath = getSessionPath(chatId, meta.currentSession);
    const timestamp = new Date()
        .toISOString()
        .replace("T", " ")
        .replace("Z", "");
    const prefix =
        role === "user"
            ? "User"
            : personalityName
              ? personalityName
              : "Assistant";
    const entry = `[${timestamp}] ${prefix}: ${message.trim()}\n`;
    await fs.appendFile(sessionPath, entry, "utf-8");
}

function normalizeConversation(entries) {
    const normalized = [];

    for (const entry of entries) {
        if (!entry?.role || !entry?.content) continue;
        const role = entry.role === "user" ? "user" : "assistant";
        const content = entry.content.trim();
        if (!content) continue;

        if (normalized.length === 0) {
            if (role === "assistant") continue;
            normalized.push({ role, content });
            continue;
        }

        const lastRole = normalized[normalized.length - 1].role;
        if (lastRole === role) {
            normalized[normalized.length - 1].content += `\n${content}`;
        } else {
            normalized.push({ role, content });
        }
    }

    return normalized;
}

export async function loadRecentConversation(chatId, maxLines = 12) {
    const meta = await loadMeta(chatId);
    const sessionPath = getSessionPath(chatId, meta.currentSession);
    if (!existsSync(sessionPath)) {
        return [];
    }

    const raw = await fs.readFile(sessionPath, "utf-8");
    return parseSessionHistory(raw, maxLines);
}

export function parseSessionHistory(raw, maxLines = 12) {
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const recent = lines.slice(-maxLines);
    const parsed = [];

    for (const line of recent) {
        const messageMatch = line.match(/^\[[^\]]+\]\s+([^:]+):\s?(.*)$/);
        if (messageMatch) {
            parsed.push({
                role: messageMatch[1] === "User" ? "user" : "assistant",
                content: messageMatch[2],
            });
            continue;
        }

        if (parsed.length > 0) {
            parsed[parsed.length - 1].content += `\n${line}`;
        }
    }

    return normalizeConversation(parsed);
}

export async function ensureMemoryDirectory() {
    await fs.mkdir(storageRoot, { recursive: true });
}

export async function smartSaveMessage(chatId, role, message) {
    if (!message || message.trim().length === 0) {
        console.log("⏭️  Message skipped (empty or whitespace)");
        return false;
    }

    if (role !== "user") {
        console.log(`⏭️  Message skipped (role is not user: ${role})`);
        return false;
    }

    const analysis = await analyzeMessageImportance(message, role);
    if (!analysis.shouldSave) {
        console.log("⏭️  Message skipped (not useful for memory)");
        return false;
    }

    const memoryContent = analysis.memory ? analysis.memory.trim() : "";
    if (!memoryContent) {
        console.log("⚠️  Memory analyzer did not provide content.");
        return false;
    }

    const memoryService = getMemoryService(chatId);
    const added = await memoryService.addShortTermMemory({
        content: memoryContent,
        importance: analysis.importance,
        category: analysis.category,
        source: "chat",
        ttlDays: analysis.ttlDays,
        metadata: {
            originalRole: role,
        },
    });

    if (added) {
        const truncated =
            memoryContent.length > 80
                ? `${memoryContent.slice(0, 80)}...`
                : memoryContent;
        console.log(
            `✅ Short-term memory queued | importance: ${analysis.importance.toFixed(2)} | category: ${analysis.category} | content: ${truncated}`,
        );
    } else {
        console.log("⚠️  Short-term memory not saved (duplicate or not added)");
    }

    return added;
}

export async function loadSmartMemory(chatId, _tags = [], limit = 20) {
    const memoryService = getMemoryService(chatId);
    return memoryService.getLongTermMemory(limit);
}

export async function getLongTermMemoryForPrompt(chatId, limit = 30) {
    const memoryService = getMemoryService(chatId);
    return memoryService.getLongTermMemoryForPrompt(limit);
}

export async function getMemoryStats(chatId) {
    const memoryService = getMemoryService(chatId);
    return memoryService.getLongTermStats();
}

export async function deleteMemoryEntry(chatId, memoryId) {
    const memoryService = getMemoryService(chatId);
    return memoryService.deleteLongTermMemory(memoryId);
}

export async function updateMemoryEntry(chatId, memoryId, newContent) {
    const memoryService = getMemoryService(chatId);
    return memoryService.updateLongTermMemory(memoryId, newContent);
}

export async function clearSmartMemory(chatId) {
    const memoryService = getMemoryService(chatId);
    await memoryService.clearLongTermMemory();
}

export async function exportSmartMemory(chatId) {
    const memoryService = getMemoryService(chatId);
    return memoryService.getLongTermMemory(1000);
}
