/**
 * Message handler.
 * Handles text messages, streaming responses, and the memory edit flow.
 */

import {
    MAX_MESSAGE_LENGTH,
    TELEGRAM_STREAM_EDIT_INTERVAL_MS,
} from "../../config/index.js";
import AIClient from "../../ai/client.js";
import { PERSONALITIES } from "../../personalities/index.js";
import { buildMemoryKeyboard } from "../utils/keyboards.js";
import { isOwner, replyNotOwner } from "../middleware/ownerCheck.js";
import {
    getChatState,
    appendChatMessage,
    loadRecentConversation,
    loadSmartMemory,
    getLongTermMemoryForPrompt,
    smartSaveMessage,
    updateMemoryEntry,
} from "../../memory/index.js";
import { getMemoryAccessLabel, hasMemoryAccess } from "../../memory/access.js";
import { getPendingMemoryEdit, deletePendingMemoryEdit } from "./actions.js";

const aiClient = new AIClient();
const STREAM_EDIT_DELAY_SEQUENCE_MS = [
    TELEGRAM_STREAM_EDIT_INTERVAL_MS,
    TELEGRAM_STREAM_EDIT_INTERVAL_MS,
    TELEGRAM_STREAM_EDIT_INTERVAL_MS * 2,
    20000,
];

function splitTelegramMessage(text) {
    return text.match(new RegExp(`.{1,${MAX_MESSAGE_LENGTH}}`, "gs")) || [
        text,
    ];
}

function getEditablePreview(text) {
    const trimmed = text.trim();
    if (!trimmed) return "";
    if (trimmed.length <= MAX_MESSAGE_LENGTH) return trimmed;
    return `${trimmed.slice(0, MAX_MESSAGE_LENGTH - 24)}\n\n...streaming`;
}

async function editMessageSafely(ctx, messageId, text) {
    if (!messageId || !text.trim()) return false;

    try {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            getEditablePreview(text),
        );
        return true;
    } catch (error) {
        const description = error.description || error.message || "";
        if (description.includes("message is not modified")) {
            return true;
        }
        console.warn("⚠️ Could not edit streaming message:", error.message);
        return false;
    }
}

async function sendFinalResponse(ctx, processingMessage, response) {
    const replyText = response.trim();
    const messages = splitTelegramMessage(replyText);

    if (processingMessage?.message_id) {
        const edited = await editMessageSafely(
            ctx,
            processingMessage.message_id,
            messages[0],
        );

        if (!edited) {
            try {
                await ctx.deleteMessage(processingMessage.message_id);
            } catch {}
            await ctx.reply(messages[0]);
        }
    } else {
        await ctx.reply(messages[0]);
    }

    for (const chunk of messages.slice(1)) {
        await ctx.reply(chunk);
    }
}

export function registerMessageHandler(bot) {
    bot.on("message", async (ctx, next) => {
        if (!ctx.message?.text) return;

        const userId = ctx.from?.id;
        const editId = getPendingMemoryEdit(ctx.chat.id, userId);
        const text = ctx.message.text.trim();

        if (!editId) {
            if (text.startsWith("/")) return;
            return next();
        }

        if (!isOwner(ctx)) return replyNotOwner(ctx);

        if (text.toLowerCase() === "cancel" || text.toLowerCase() === "لغو") {
            deletePendingMemoryEdit(ctx.chat.id, userId);
            await ctx.reply("✋ Memory edit canceled.");
            return;
        }

        if (text.startsWith("/")) {
            return;
        }

        const chatState = await getChatState(ctx.chat.id);
        const personality =
            PERSONALITIES[chatState.personality] ||
            PERSONALITIES[Object.keys(PERSONALITIES)[0]];
        if (!hasMemoryAccess(personality)) {
            deletePendingMemoryEdit(ctx.chat.id, userId);
            await ctx.reply(
                `🧠 Memory editing is only enabled for ${getMemoryAccessLabel()}. Current personality: ${personality.name}.`,
            );
            return;
        }

        const updated = await updateMemoryEntry(ctx.chat.id, editId, text);
        deletePendingMemoryEdit(ctx.chat.id, userId);

        if (updated) {
            await ctx.reply("✅ Memory entry updated.");
            const memoryEntries = await loadSmartMemory(ctx.chat.id, [], 10);
            await ctx.reply(
                "📝 Here is your updated memory list:",
                buildMemoryKeyboard(memoryEntries),
            );
        } else {
            await ctx.reply(
                "⚠️ Could not update the memory entry. It may no longer exist.",
            );
        }
    });

    bot.on("message", async (ctx) => {
        if (!ctx.message?.text) return;

        const userId = Number(ctx.from.id);
        if (!isOwner(ctx)) return replyNotOwner(ctx);

        if (ctx.message.text.startsWith("/")) return;

        const userMessage = ctx.message.text.trim();
        const username = ctx.from.username || "Unknown";

        console.log("-".repeat(50));
        console.log(`💬 Message from ${username} (${userId}): ${userMessage}`);

        try {
            const chatState = await getChatState(ctx.chat.id);
            const personality =
                PERSONALITIES[chatState.personality] ||
                PERSONALITIES[Object.keys(PERSONALITIES)[0]];
            const memoryAccess = hasMemoryAccess(personality);

            const recentAll = await loadRecentConversation(ctx.chat.id, 50);
            const recentHistory = Array.isArray(recentAll)
                ? recentAll.slice(-8)
                : [];

            const memoryContext = memoryAccess
                ? await getLongTermMemoryForPrompt(ctx.chat.id, 30)
                : "";

            await ctx.sendChatAction("typing");
            const processingMessage = await ctx.reply(
                `⏳ *Processing...*
🤖 Model: \`${aiClient.model}\`
🎭 Personality: ${personality.name}
🧠 Memory: ${memoryAccess ? (memoryContext ? "enabled" : "empty") : "disabled"}`,
                { parse_mode: "Markdown" },
            );
            await ctx.sendChatAction("typing");

            await appendChatMessage(ctx.chat.id, "user", userMessage);

            if (memoryAccess) {
                const userSaved = await smartSaveMessage(
                    ctx.chat.id,
                    "user",
                    userMessage,
                );
                console.log(
                    `🧠 Short-term memory queue: ${userSaved ? "saved" : "skipped"}`,
                );
            } else {
                console.log(
                    `🧠 Memory disabled for ${personality.name}; prompt uses no long-term memory and no short-term write.`,
                );
            }

            let nextEditAt = Date.now() + STREAM_EDIT_DELAY_SEQUENCE_MS[0];
            let editDelayIndex = 0;
            let lastEditedText = "";

            const response = await aiClient.chatStream(
                userMessage,
                personality,
                recentHistory,
                memoryContext,
                async (partialText) => {
                    const now = Date.now();
                    const preview = getEditablePreview(partialText);
                    if (!preview || preview === lastEditedText) return;
                    if (now < nextEditAt) {
                        return;
                    }

                    const edited = await editMessageSafely(
                        ctx,
                        processingMessage.message_id,
                        preview,
                    );
                    if (edited) {
                        lastEditedText = preview;
                        editDelayIndex = Math.min(
                            editDelayIndex + 1,
                            STREAM_EDIT_DELAY_SEQUENCE_MS.length - 1,
                        );
                        nextEditAt =
                            now + STREAM_EDIT_DELAY_SEQUENCE_MS[editDelayIndex];
                        await ctx.sendChatAction("typing");
                    }
                },
            );

            if (!response) {
                if (processingMessage?.message_id) {
                    try {
                        await ctx.deleteMessage(processingMessage.message_id);
                    } catch {}
                }

                await ctx.reply(
                    `❌ *Oops!* Something went wrong.

I couldn't process your request at the moment. Please try again in a moment.

_If the problem persists, check that Ollama is running and the model in .env is installed._ 🔧`,
                    { parse_mode: "Markdown" },
                );
                console.error(
                    `❌ Failed to get response for user ${username} (${userId})`,
                );
                return;
            }

            await appendChatMessage(
                ctx.chat.id,
                "assistant",
                response,
                personality.name,
            );

            await sendFinalResponse(ctx, processingMessage, response);
            console.log(`✅ Sent response to ${username} (${userId})`);
        } catch (error) {
            console.error(`❌ Error processing message: ${error.message}`);
            await ctx.reply(
                `❌ *Error*

Something unexpected happened. Please try again.`,
                { parse_mode: "Markdown" },
            );
        }
    });
}
