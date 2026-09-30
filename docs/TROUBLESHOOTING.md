# Troubleshooting

Start with the complete project check:

```bash
npm run check
```

It runs lint and tests before reporting missing local tools, invalid required values, Ollama connection problems, and unavailable models. Use `npm run check:setup` when you only need the environment and Ollama checks.

## Node.js is too old

Check the installed version:

```bash
node --version
```

Fabrexa requires Node.js 22 or newer. Install a current Node.js 22 release, reopen the terminal, and run `npm install` again.

## `.env` is missing

Copy the example file before starting the bot:

```bash
cp .env.example .env
```

On Windows Command Prompt:

```bat
copy .env.example .env
```

Then replace the placeholder token, owner ID, and owner username.

## `TELEGRAM_BOT_TOKEN is not set`

Make sure `.env` contains a token created by [@BotFather](https://t.me/botfather):

```env
TELEGRAM_BOT_TOKEN=your_actual_token
```

Do not add extra spaces around the value. Restart the bot after changing `.env`.

`npm run check` confirms that a value exists, but it does not ask Telegram whether the token is valid. A malformed or revoked token normally fails when the bot starts.

## `OWNER_ID must be a numeric Telegram user id`

Private mode requires a numeric owner ID:

```env
BOT_PRIVATE=true
OWNER_ID=123456789
```

Do not use a Telegram username. If you intentionally want a shared bot, set `BOT_PRIVATE=false`; understand that anyone who can reach the bot can then use your local model.

## `OWNER_USERNAME must be a valid Telegram username`

Private mode also requires the public Telegram username that should receive access requests:

```env
BOT_PRIVATE=true
OWNER_USERNAME=your_telegram_username
```

This is separate from `OWNER_ID`: the numeric ID authorizes access, while the username is shown to users who cannot access the private instance. You may include or omit the leading `@`. Use 5 to 32 letters, numbers, or underscores, and restart the bot after changing `.env`.

## Ollama is not reachable

Start Ollama and confirm its local API is available:

```bash
ollama serve
```

The default address is:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

If Ollama runs on another machine, set its reachable base URL without adding `/api/chat`.

## The configured model is missing

List installed models:

```bash
ollama list
```

Install the example model:

```bash
ollama pull gemma3:12b
```

The value in `.env` must match the model name shown by `ollama list`:

```env
OLLAMA_MODEL=gemma3:12b
```

For a Hugging Face GGUF model, keep the exact `hf.co/...` reference used by the Ollama command.

## The bot starts but messages fail

Check these items:

1. Ollama is still running.
2. `OLLAMA_MODEL` matches an installed model.
3. The tracked `personalities/Friendly.txt` file is present.
4. Any custom personality file has a non-empty prompt.
5. The request timeout is long enough for your hardware.

The included `personalities/Friendly.txt` file begins like this:

```text
Name: Friendly
Prompt:
You are Friendly, a warm, thoughtful, and easygoing assistant.
```

## Replies are slow or stop early

Local generation speed depends on the selected model and hardware.

Try a smaller model or reduce these values:

```env
OLLAMA_NUM_CTX=4096
OLLAMA_MAX_TOKENS=256
```

If generation needs more time, increase:

```env
REQUEST_TIMEOUT=180000
```

Telegram response edits are intentionally limited. `TELEGRAM_STREAM_EDIT_INTERVAL_MS` controls the initial interval, and the bot increases later delays to avoid excessive edits.

## A personality does not appear

- Place the file directly inside `personalities/`.
- Use the `.txt` extension.
- Restart the bot after adding or renaming a file.
- Give each file a distinct filename because the filename becomes its key.

Personality files are loaded when the process starts, not while it is running.

## Memory is disabled

Memory access is controlled per personality:

```env
MEMORY_ENABLED_PERSONALITIES=Friendly,Vent Girl
```

Friendly and Vent Girl use memory by default. Use the filename without `.txt`, or the displayed `Name` value. Separate multiple entries with commas and restart the bot after changing the setting.

An empty value disables short-term and long-term memory for every personality:

```env
MEMORY_ENABLED_PERSONALITIES=
```

## No long-term memories appear

This can be normal. The analyzer skips small talk and facts it does not consider useful. Saved short-term entries also need to meet the promotion rules before they become long-term memories.

Run the processor manually:

```bash
npm run memory-process
```

Check that the active personality is listed in `MEMORY_ENABLED_PERSONALITIES` and inspect `chat_memory/<chat-id>/memory-short-term.json` for local diagnostic use.

## The memory processor does not start

Validate the cron expression:

```env
MEMORY_PROCESSOR_CRON="0 0 * * *"
MEMORY_PROCESSOR_TIMEZONE=Asia/Tehran
```

`npm run check` validates the cron expression. The timezone must be a valid IANA timezone supported by the installed runtime.

## Detailed diagnostics

Enable development logging temporarily:

```env
LOG_MODE=dev-mode
```

Restart the bot and reproduce the issue. These logs can contain the full Ollama payload, personality prompt, conversation history, and memory context. Do not publish them without reviewing the contents.

Return to normal logging afterward:

```env
LOG_MODE=normal
```

## Resetting local runtime data

Starting a new chat from Telegram is the safest way to clear current conversational context while preserving long-term memory.

The `chat_memory/` folder contains conversation and memory files. Back it up before manually changing or removing anything. Deleting it permanently removes the bot's local conversation state and saved memories.
