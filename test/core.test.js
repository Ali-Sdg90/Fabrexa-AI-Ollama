import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.OWNER_ID = "1001";
process.env.OWNER_USERNAME = "fabrexa_owner";
process.env.BOT_PRIVATE = "true";
process.env.MEMORY_ENABLED_PERSONALITIES = "Friendly,Vent Girl";
process.env.OLLAMA_NUM_CTX = "8192";
process.env.OLLAMA_MAX_TOKENS = "512";
process.env.CHAT_HISTORY_MAX_MESSAGES = "24";
process.env.CHAT_HISTORY_MAX_TOKENS = "4096";

const { PERSONALITIES } = await import("../src/personalities/index.js");
const {
    getPendingMemoryEdit,
    setPendingMemoryEdit,
    deletePendingMemoryEdit,
} = await import("../src/bot/handlers/actions.js");
const { registerMessageHandler } = await import(
    "../src/bot/handlers/messages.js"
);
const { getMemoryService } = await import("../src/memory/memoryService.js");
const { parseSessionHistory } = await import("../src/memory/index.js");
const { default: AIClient, estimateTokenCount, selectRecentHistory } =
    await import("../src/ai/client.js");
const { hasMemoryAccess } = await import("../src/memory/access.js");
const { PRIVATE_ACCESS_MESSAGE, replyNotOwner } = await import(
    "../src/bot/middleware/ownerCheck.js"
);

function getMessageHandlers() {
    const handlers = [];
    registerMessageHandler({
        on(event, handler) {
            if (event === "message") handlers.push(handler);
        },
    });
    return handlers;
}

function createContext(chatId, userId, text) {
    return {
        chat: { id: chatId },
        from: { id: userId, username: `user-${userId}` },
        message: { text },
        replies: [],
        async reply(message) {
            this.replies.push(message);
            return { message_id: this.replies.length };
        },
    };
}

async function dispatchMessage(ctx) {
    const [pendingEditHandler, regularMessageHandler] = getMessageHandlers();
    await pendingEditHandler(ctx, () => regularMessageHandler(ctx));
}

test("the four demo personalities and Friendly default are available", () => {
    for (const key of [
        "Friendly",
        "Elara Voss",
        "Sherlock Holmes",
        "Vent Girl",
    ]) {
        assert.ok(PERSONALITIES[key], `${key} should be available`);
    }

    assert.equal(PERSONALITIES.Friendly.name, "Friendly");
    assert.equal(PERSONALITIES.Friendly.key, "Friendly");
    assert.equal(PERSONALITIES.friendly, PERSONALITIES.Friendly);
    assert.equal(hasMemoryAccess(PERSONALITIES.Friendly), true);
    assert.equal(hasMemoryAccess(PERSONALITIES["Vent Girl"]), true);
    assert.equal(hasMemoryAccess(PERSONALITIES["Elara Voss"]), false);
    assert.equal(hasMemoryAccess(PERSONALITIES["Sherlock Holmes"]), false);
    assert.match(
        PERSONALITIES.Friendly.prompt,
        /warm, thoughtful, and easygoing assistant/i,
    );
});

test("another group user cannot complete or cancel an owner's pending edit", async () => {
    const chatId = `test-unauthorized-${process.pid}`;
    const ownerId = 1001;
    const otherUserId = 2002;

    setPendingMemoryEdit(chatId, ownerId, "memory-owner");
    try {
        const cancelContext = createContext(chatId, otherUserId, "cancel");
        await dispatchMessage(cancelContext);
        assert.equal(
            getPendingMemoryEdit(chatId, ownerId),
            "memory-owner",
        );
        assert.deepEqual(cancelContext.replies, [PRIVATE_ACCESS_MESSAGE]);

        const editContext = createContext(chatId, otherUserId, "Changed text");
        await dispatchMessage(editContext);
        assert.equal(
            getPendingMemoryEdit(chatId, ownerId),
            "memory-owner",
        );
        assert.deepEqual(editContext.replies, [PRIVATE_ACCESS_MESSAGE]);
    } finally {
        deletePendingMemoryEdit(chatId, ownerId);
    }
});

test("private access replies explain how to contact the owner and self-host", async () => {
    const ctx = createContext("private-chat", 2002, "/start");

    await replyNotOwner(ctx);

    assert.equal(ctx.replies.length, 1);
    assert.match(ctx.replies[0], /private mode/i);
    assert.match(ctx.replies[0], /@fabrexa_owner/);
    assert.match(
        ctx.replies[0],
        /https:\/\/github\.com\/Ali-Sdg90\/Fabrexa-AI-Ollama/,
    );
});

test("private access callbacks show an alert and send the full message", async () => {
    const ctx = createContext("private-callback", 2002, "");
    ctx.callbackAnswers = [];
    ctx.answerCbQuery = async function (message, options) {
        this.callbackAnswers.push({ message, options });
    };

    await replyNotOwner(ctx, true);

    assert.deepEqual(ctx.callbackAnswers, [
        {
            message: "This bot is currently in private mode.",
            options: { show_alert: true },
        },
    ]);
    assert.deepEqual(ctx.replies, [PRIVATE_ACCESS_MESSAGE]);
});

test("the owner can complete a pending memory edit", async () => {
    const chatId = `test-authorized-${process.pid}`;
    const ownerId = 1001;
    const memoryId = "memory-test";
    const memoryService = getMemoryService(chatId);
    const chatFolder = path.join("chat_memory", String(chatId));

    await memoryService.saveLongTermMemory([
        {
            id: memoryId,
            content: "Before",
            category: "other",
            importance: 0.8,
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
        },
    ]);
    setPendingMemoryEdit(chatId, ownerId, memoryId);

    try {
        const ctx = createContext(chatId, ownerId, "After");
        await dispatchMessage(ctx);

        const entries = await memoryService.loadLongTermMemory();
        assert.equal(entries[0].content, "After");
        assert.equal(getPendingMemoryEdit(chatId, ownerId), undefined);
        assert.equal(ctx.replies[0], "✅ Memory entry updated.");
    } finally {
        deletePendingMemoryEdit(chatId, ownerId);
        await fs.rm(chatFolder, { recursive: true, force: true });
    }
});

test("a multiline user message keeps the user role", () => {
    const history = parseSessionHistory(
        "[2026-01-01 10:00:00.000] User: First line\nSecond line\n[2026-01-01 10:00:01.000] Friendly: Reply",
    );

    assert.deepEqual(history[0], {
        role: "user",
        content: "First line\nSecond line",
    });
});

test("a multiline assistant message keeps the assistant role", () => {
    const history = parseSessionHistory(
        "[2026-01-01 10:00:00.000] User: Question\n[2026-01-01 10:00:01.000] Friendly: First line\nSecond line",
    );

    assert.deepEqual(history[1], {
        role: "assistant",
        content: "First line\nSecond line",
    });
});

test("session history limits parsed messages instead of physical lines", () => {
    const history = parseSessionHistory(
        [
            "[2026-01-01 10:00:00.000] User: Old question",
            "Old question continuation",
            "[2026-01-01 10:00:01.000] Friendly: Old answer",
            "Old answer continuation",
            "[2026-01-01 10:00:02.000] User: Latest question",
        ].join("\n"),
        2,
    );

    assert.deepEqual(history, [
        {
            role: "assistant",
            content: "Old answer\nOld answer continuation",
        },
        { role: "user", content: "Latest question" },
    ]);
});

test("the Ollama prompt keeps up to 24 previous messages", () => {
    const client = new AIClient();
    const history = Array.from({ length: 30 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `history-${index}`,
    }));

    const messages = client.buildMessages(
        "latest message",
        { prompt: "Keep replies concise." },
        history,
        "",
    );
    const includedHistory = messages.slice(1, -1);

    assert.equal(includedHistory.length, 24);
    assert.equal(includedHistory[0].content, "history-6");
    assert.equal(includedHistory.at(-1).content, "history-29");
});

test("history trimming keeps the newest complete exchange within its token budget", () => {
    const history = [
        { role: "user", content: "older question" },
        { role: "assistant", content: "older answer" },
        { role: "user", content: "newer question" },
        { role: "assistant", content: "newer answer" },
    ];
    const newestExchangeBudget =
        estimateTokenCount("newer question") +
        estimateTokenCount("newer answer") +
        8;

    assert.deepEqual(
        selectRecentHistory(history, 24, newestExchangeBudget),
        history.slice(-2),
    );
});

test("fixed prompt content can reduce history to protect the context window", () => {
    const client = new AIClient();
    const messages = client.buildMessages(
        "latest message",
        { prompt: "پ".repeat(8000) },
        [
            { role: "user", content: "previous question" },
            { role: "assistant", content: "previous answer" },
        ],
        "",
    );

    assert.deepEqual(
        messages.map((message) => message.role),
        ["system", "user"],
    );
});
