/**
 * Callback action handlers for inline keyboard buttons.
 */

import { isOwner, replyNotOwner } from "../middleware/ownerCheck.js";
import {
    mainMenu,
    buildPersonalityMenu,
    buildMemoryKeyboard,
} from "../utils/keyboards.js";
import { PERSONALITIES } from "../../personalities/index.js";
import {
    createNewChatSession,
    updateChatPersonality,
    loadSmartMemory,
    getMemoryStats,
    deleteMemoryEntry,
    getChatState,
} from "../../memory/index.js";
import { getMemoryAccessLabel, hasMemoryAccess } from "../../memory/access.js";

const pendingMemoryEdit = new Map();

function getPendingMemoryEditKey(chatId, userId) {
    return `${chatId}:${userId}`;
}

async function getCurrentPersonality(chatId) {
    const chatState = await getChatState(chatId);
    return (
        PERSONALITIES[chatState.personality] ||
        PERSONALITIES[Object.keys(PERSONALITIES)[0]]
    );
}

async function requireMemoryAccess(ctx) {
    const personality = await getCurrentPersonality(ctx.chat.id);
    if (hasMemoryAccess(personality)) {
        return true;
    }

    const message = `🧠 Memory is only enabled for ${getMemoryAccessLabel()}. Current personality: ${personality.name}.`;
    if (typeof ctx.answerCbQuery === "function") {
        await ctx.answerCbQuery(message, { show_alert: true });
    } else {
        await ctx.reply(message);
    }
    return false;
}

function formatMemoryList(memoryEntries) {
    if (!memoryEntries.length) {
        return "No long-term memories saved yet.";
    }

    return memoryEntries
        .map((entry, idx) => {
            const timestamp = entry.updatedAt || entry.createdAt || "unknown time";
            const displayTime = timestamp.replace("T", " ").replace("Z", "");
            const importance =
                typeof entry.importance === "number"
                    ? entry.importance.toFixed(2)
                    : "0.00";
            const content = entry.content || "";
            return `• ${idx + 1}. [${displayTime}] ${entry.category || "other"} | importance ${importance} — ${content.substring(0, 120)}${
                content.length > 120 ? "..." : ""
            }`;
        })
        .join("\n");
}

export function registerActionHandlers(bot) {
    bot.action("new_chat", async (ctx) => {
        if (!isOwner(ctx)) return replyNotOwner(ctx, true);
        await createNewChatSession(ctx.chat.id);
        await ctx.answerCbQuery("✨ New chat session created.");
        await ctx.reply(
            "✨ New chat session started. Long-term memory stays available for memory-enabled personalities.",
            mainMenu,
        );
    });

    bot.action("configure_personality", async (ctx) => {
        if (!isOwner(ctx)) return replyNotOwner(ctx, true);
        await ctx.answerCbQuery("🎭 Choose a personality");
        await ctx.editMessageText(
            "🎭 Choose a personality for this chat:",
            buildPersonalityMenu(),
        );
    });

    bot.action(/set_personality_(.+)/, async (ctx) => {
        if (!isOwner(ctx)) return replyNotOwner(ctx, true);
        const personalityKey = ctx.match[1];
        if (!PERSONALITIES[personalityKey]) {
            await ctx.answerCbQuery("Personality not found", {
                show_alert: true,
            });
            return;
        }

        await createNewChatSession(ctx.chat.id);
        await updateChatPersonality(ctx.chat.id, personalityKey);
        await ctx.answerCbQuery(
            `✨ ${PERSONALITIES[personalityKey].name} selected`,
        );
        await ctx.editMessageText(
            `✨ Personality updated to ${PERSONALITIES[personalityKey].name}.\n\n🆕 New chat session started for this personality.`,
        );
    });

    bot.action("show_memory", async (ctx) => {
        if (!isOwner(ctx)) return replyNotOwner(ctx, true);
        if (!(await requireMemoryAccess(ctx))) return;

        const memStats = await getMemoryStats(ctx.chat.id);
        const memoryEntries = await loadSmartMemory(ctx.chat.id, [], 10);

        const memoryInfo = `📊 Long-Term Memory Stats:
• Total entries: ${memStats.totalEntries}
• Average importance: ${memStats.averageImportance}

🧠 Stored long-term memories:
${formatMemoryList(memoryEntries)}`;

        await ctx.answerCbQuery();
        await ctx.editMessageText(
            memoryInfo,
            buildMemoryKeyboard(memoryEntries),
        );
    });

    bot.action(/memory_delete_(.+)/, async (ctx) => {
        if (!isOwner(ctx)) return replyNotOwner(ctx, true);
        if (!(await requireMemoryAccess(ctx))) return;

        const memoryId = ctx.match[1];
        await ctx.answerCbQuery();
        const deleted = await deleteMemoryEntry(ctx.chat.id, memoryId);
        if (!deleted) {
            await ctx.reply(
                "⚠️ Memory entry not found or could not be deleted.",
            );
            return;
        }

        const memoryEntries = await loadSmartMemory(ctx.chat.id, [], 10);
        await ctx.editMessageText(
            "🗑️ Memory entry archived.",
            buildMemoryKeyboard(memoryEntries),
        );
    });

    bot.action(/memory_edit_(.+)/, async (ctx) => {
        if (!isOwner(ctx)) return replyNotOwner(ctx, true);
        if (!(await requireMemoryAccess(ctx))) return;

        const memoryId = ctx.match[1];
        await ctx.answerCbQuery();
        setPendingMemoryEdit(ctx.chat.id, ctx.from.id, memoryId);
        await ctx.reply(
            "✍️ Send the new long-term memory text for this entry, or type cancel.",
        );
    });
}

export function getPendingMemoryEdit(chatId, userId) {
    return pendingMemoryEdit.get(getPendingMemoryEditKey(chatId, userId));
}

export function deletePendingMemoryEdit(chatId, userId) {
    pendingMemoryEdit.delete(getPendingMemoryEditKey(chatId, userId));
}

export function setPendingMemoryEdit(chatId, userId, memoryId) {
    pendingMemoryEdit.set(
        getPendingMemoryEditKey(chatId, userId),
        memoryId,
    );
}
