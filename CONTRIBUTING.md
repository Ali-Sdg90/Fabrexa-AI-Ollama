# Contributing

Thanks for taking the time to improve Fabrexa AI.

## Before you begin

1. Read the [README](./README.md) and complete the local setup.
2. Use a separate Telegram bot for development when possible.
3. Keep `.env`, bot tokens, personality prompts, logs, and `chat_memory/` out of commits.

## Development setup

```bash
git clone https://github.com/Ali-Sdg90/Fabrexa-AI-Ollama.git
cd Fabrexa-AI-Ollama
npm install
cp .env.example .env
```

Configure `.env`, add a local personality file, start Ollama, then run:

```bash
npm run check
npm run dev
```

See the [Project Guide](./docs/PROJECT_GUIDE.md) for the runtime flow and configuration reference.

## Making a change

- Keep each pull request focused on one problem.
- Follow the existing ES module structure and formatting.
- Reuse the configuration module instead of reading environment variables in feature code.
- Avoid committing generated runtime data.
- Update documentation when behavior or configuration changes.

## Validation

Run the checks that apply to your change:

```bash
npm run lint
npm run check
```

`npm run check` needs a configured local environment and running Ollama server. It does not validate the Telegram token remotely.

There is currently no automated test suite. Manually verify affected Telegram flows, streaming behavior, personality selection, and memory behavior with a test bot when relevant.

For static website changes, preview `public/` locally:

```bash
python -m http.server 8000 --directory public
```

Check desktop and mobile layouts, keyboard navigation, image loading, and the browser console.

## Documentation

The project intentionally keeps a small documentation set:

- `README.md` introduces the project and contains the installation path.
- `docs/PROJECT_GUIDE.md` explains implementation and configuration details.
- `docs/TROUBLESHOOTING.md` covers common failures.

Prefer improving one of these files instead of adding another overlapping guide.

## Pull requests

Include:

- What changed
- Why the change is needed
- How it was checked
- Any configuration or compatibility impact

Do not include secrets, private conversations, local memory files, or development payload logs.

## License

By contributing, you agree that your contribution will be licensed under the project's [MIT License](./LICENSE).
