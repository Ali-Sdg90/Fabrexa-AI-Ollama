# Project Guide

This guide covers Fabrexa's runtime structure, configuration, personalities, and memory behavior. Start with the main [README](../README.md) if you only want to install and run the bot.

## Runtime flow

Fabrexa uses Telegram as the chat interface and Ollama as the local model server.

```text
Telegram update
    ↓
Telegraf handlers
    ↓
Access check
    ↓
Conversation and personality context
    ↓
Ollama /api/chat
    ↓
Streamed Telegram reply
```

For each normal text message, the bot:

1. Checks access when private mode is enabled.
2. Loads the active personality and conversation session.
3. Loads up to eight recent messages from the active session.
4. Adds long-term memory when the selected personality is allowed to use it.
5. Sends the request to Ollama with streaming enabled.
6. Updates the Telegram response while the model is generating it.
7. Stores the final conversation locally.

The Ollama request includes `temperature`, `top_p`, `num_ctx`, `num_predict`, and `keep_alive` from the environment configuration.

## Main modules

| Path | Responsibility |
| --- | --- |
| `bot.js` | Application entry point |
| `src/bot/` | Telegram commands, quick actions, callbacks, and access control |
| `src/ai/client.js` | Ollama request construction and streaming |
| `src/config/index.js` | Environment parsing and defaults |
| `src/personalities/` | Personality file loading |
| `src/memory/index.js` | Conversation sessions and memory coordination |
| `src/memory/memoryService.js` | Short-term and long-term storage |
| `src/memory/analyzer.js` | Model-based memory classification |
| `src/memory/processor.js` | Scheduled memory promotion and cleanup |

## Personalities

Personalities are local `.txt` files inside `personalities/`. The filename without `.txt` is the personality key.

```text
Name: Friendly
Prompt:
You are Friendly, a warm, thoughtful, and easygoing assistant.
```

The `Name` line is shown in Telegram. Everything after `Prompt:` becomes the personality prompt.

The tracked `Friendly.txt` file provides the default personality. The repository also includes Elara Voss, Sherlock Holmes, and Vent Girl as demo personalities, so a fresh clone is ready to use. Additional personality prompt files remain ignored by Git to keep private prompts out of commits.

## Conversation and memory

Fabrexa stores runtime data under `chat_memory/<chat-id>/`.

| File | Purpose |
| --- | --- |
| `meta.json` | Active session number and selected personality |
| `session_<id>.txt` | Messages from one conversation session |
| `memory-short-term.json` | Temporary memory candidates |
| `memory-long-term.json` | Stable memory used in future prompts |

### Recent conversation

Recent messages from the active session provide normal conversational context. Starting a new chat creates a new session, so earlier session messages are no longer included.

### Short-term memory

For memory-enabled personalities, the analyzer checks user messages for useful facts such as preferences, goals, routines, profile details, projects, and meaningful context. Messages that are not useful for memory are skipped.

### Long-term memory

The memory processor runs on a cron schedule. It promotes stable short-term entries when they meet the current importance and category rules, merges duplicates, and expires or archives temporary entries.

Long-term memories remain available after starting a new chat. The Telegram memory action lets the user view, edit, and archive them.

Memory is enabled per personality:

```env
MEMORY_ENABLED_PERSONALITIES=Friendly,Vent Girl
```

Friendly and Vent Girl use memory by default. The values can match personality keys or displayed names. Change the list for different personalities, or leave the variable empty to disable short-term and long-term memory for every personality.

## Environment reference

The repository's [`.env.example`](../.env.example) is the source of truth for a ready-to-copy configuration.

### Telegram

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes | None | Token created with BotFather |
| `OWNER_ID` | In private mode | None | Numeric Telegram user allowed to use the bot |
| `OWNER_USERNAME` | In private mode | None | Public contact handle shown to users denied access |
| `BOT_PRIVATE` | No | `true` | Restricts access to `OWNER_ID` |

`OWNER_ID` is used for authorization and must be numeric. `OWNER_USERNAME` is displayed in the private-mode response so other users can request access; it may be entered with or without the leading `@`. When `BOT_PRIVATE=false`, any Telegram user who can reach the bot can use it, and neither owner value is required. Runtime data is still separated by Telegram chat ID.

### Ollama and generation

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server base URL without `/api/chat` |
| `OLLAMA_MODEL` | `llama3.1` in code | Main chat model |
| `OLLAMA_ANALYZER_MODEL` | Main chat model | Optional separate memory analyzer model |
| `OLLAMA_KEEP_ALIVE` | `10m` | How long Ollama keeps a model loaded |
| `OLLAMA_NUM_CTX` | `8192` | Context window size |
| `OLLAMA_TEMPERATURE` | `0.8` | Sampling temperature |
| `OLLAMA_TOP_P` | `0.9` | Nucleus sampling value |
| `OLLAMA_MAX_TOKENS` | `512` | Maximum generated tokens per response |
| `PERSONALITY_INSTRUCTION` | Built-in instruction | Prefix added before the selected personality prompt |
| `REQUEST_TIMEOUT` | `120000` | Ollama request timeout in milliseconds |

`.env.example` selects `gemma3:12b`, so a normal installation uses that model unless you change it.

### Streaming, memory, and logs

| Variable | Default | Purpose |
| --- | --- | --- |
| `TELEGRAM_STREAM_EDIT_INTERVAL_MS` | `6000` | Initial delay between Telegram response edits |
| `MEMORY_ENABLED_PERSONALITIES` | `Friendly,Vent Girl` | Comma-separated personality keys or names with memory access |
| `MEMORY_PROCESSOR_CRON` | `0 0 * * *` | Memory processing schedule |
| `MEMORY_PROCESSOR_TIMEZONE` | `Asia/Tehran` | IANA timezone used by the schedule |
| `LOG_MODE` | `normal` | Use `dev-mode`, `debug`, or `verbose` for payload diagnostics |
| `LOG_LEVEL` | `INFO` | Configured log-level value |

Detailed logging can include prompts, recent conversation content, and memory context. Use it only while diagnosing local behavior.

## Models from Hugging Face

Ollama can run compatible GGUF repositories from Hugging Face:

```bash
ollama run hf.co/<publisher>/<model>-GGUF:Q4_K_M
```

After the first run, place the exact reference in `.env`:

```env
OLLAMA_MODEL=hf.co/<publisher>/<model>-GGUF:Q4_K_M
```

Model names and available quantizations differ by repository. Follow the command shown on the model page or the [official Hugging Face Ollama guide](https://huggingface.co/docs/hub/ollama).

## Local validation

```bash
npm run check
```

`npm run check` performs static JavaScript checks, runs the focused automated tests, and then verifies:

- `.env` exists
- Node.js, npm, and the Ollama CLI are available
- Required environment values are present
- The memory cron expression is valid
- The Ollama server responds
- The configured model is installed

It prints `✅ All checks passed.` only after every step succeeds. Use `npm run check:setup` to run only the environment and Ollama checks. Neither command validates the Telegram token with Telegram or sends a test message.

Changes to Telegram interactions, streaming, personalities, and memory should also be checked manually with a test bot and local model.

## Static project website

The portfolio page is independent of the bot runtime and lives in `public/`.

```bash
python -m http.server 8000 --directory public
```

The site uses plain HTML, CSS, and JavaScript. It does not require a frontend build step.

## Security and privacy

- Keep `.env`, bot tokens, private personality prompts, and `chat_memory/` out of Git.
- Keep private mode enabled unless public access is intentional.
- Use a public contact username for `OWNER_USERNAME`; private-mode users will see it.
- Treat detailed development logs as sensitive because they can contain conversation context.
- Telegram transports the messages, even though model inference runs through the configured Ollama server.
- Back up `chat_memory/` before moving or replacing an installation if its saved conversations matter.

For common runtime failures, see [Troubleshooting](./TROUBLESHOOTING.md).
