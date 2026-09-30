# Fabrexa AI Ollama

Fabrexa AI Ollama is a self-hosted Telegram bot for chatting with a local LLM through Ollama.

## What it does

- Uses Telegram as the chat interface
- Runs the configured model through Ollama
- Streams generated replies into the Telegram conversation
- Includes four demo personalities and loads custom ones from local text files
- Keeps recent conversation context
- Supports optional short-term and long-term memory
- Provides private owner-only access by default

Telegram carries messages between the user and bot. Model inference, personality prompts, conversations, and memory files remain on the machine hosting Fabrexa.

## Requirements

- Node.js 22 or newer
- Ollama
- A Telegram bot token
- A numeric Telegram user ID when private mode is enabled
- A public Telegram username for private-mode access requests

## Basic setup

```bash
git clone https://github.com/Ali-Sdg90/Fabrexa-AI-Ollama.git
cd Fabrexa-AI-Ollama
npm install
ollama pull gemma3:12b
```

Copy `.env.example` to `.env`, then add the Telegram token, numeric owner ID, and public owner username. In private mode, the username is shown to users who want to request access. The included `Friendly` personality works without additional setup:

```bash
npm run check
npm start
```

## Documentation

- [Source and README](https://github.com/Ali-Sdg90/Fabrexa-AI-Ollama)
- [Project guide](https://github.com/Ali-Sdg90/Fabrexa-AI-Ollama/blob/main/docs/PROJECT_GUIDE.md)
- [Troubleshooting](https://github.com/Ali-Sdg90/Fabrexa-AI-Ollama/blob/main/docs/TROUBLESHOOTING.md)
- [LLM-readable map](./llms.txt)

Fabrexa AI Ollama was designed and developed by Ali Sadeghi and is licensed under the MIT License.
