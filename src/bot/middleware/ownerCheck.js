/**
 * Owner authentication middleware
 */

import {
    BOT_PRIVATE,
    OWNER_ID,
    OWNER_USERNAME,
} from "../../config/index.js";

const PROJECT_REPOSITORY_URL =
    "https://github.com/Ali-Sdg90/Fabrexa-AI-Ollama";

export const PRIVATE_ACCESS_MESSAGE = `🔒 This bot is currently operating in private mode.

Access to this Fabrexa AI instance is restricted. To request access, please contact the administrator at @${OWNER_USERNAME}.

Alternatively, you can run your own instance using the source code and setup guide on GitHub:
${PROJECT_REPOSITORY_URL}`;

export function isOwner(ctx) {
    return !BOT_PRIVATE || Number(ctx.from?.id) === OWNER_ID;
}

export async function replyNotOwner(ctx, isCallback = false) {
    if (isCallback && typeof ctx.answerCbQuery === "function") {
        await ctx.answerCbQuery("This bot is currently in private mode.", {
            show_alert: true,
        });
    }
    await ctx.reply(PRIVATE_ACCESS_MESSAGE);
}
