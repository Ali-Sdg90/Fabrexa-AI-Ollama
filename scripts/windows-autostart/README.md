# Windows autostart helper

This optional helper starts the local services required by Fabrexa after a Windows user signs in. The repository files do not register or run themselves automatically.

## What it does

The PowerShell controller:

1. prevents duplicate autostart attempts;
2. starts Nekoray when it is not already running;
3. waits until the Telegram API is consistently reachable;
4. starts the local Ollama server when necessary;
5. starts the Fabrexa bot from the configured repository; and
6. writes runtime output, errors, and the bot PID to the user's local application-data directory.

Transient connection or startup failures are retried instead of ending the entire sign-in attempt.

## Files

- `fabrexa.ps1` is the runtime controller.
- `fab.cmd` provides short management commands from the same directory.
- `Fabrexa-Autostart.vbs` launches the controller in a hidden PowerShell window.

None of these files contains or should contain tokens, owner identifiers, `.env` values, private prompts, chat memory, logs, or user-specific absolute paths.

## Configuration

Set the following user environment variable before installing the Startup launcher:

- `FABREXA_REPO`: the local Fabrexa repository directory.

If `fabrexa.ps1` is executed directly from this repository layout, it can also discover the repository relative to its own location.

Nekoray is resolved from `PATH`. If it is not available there, set:

- `NEKORAY_EXE`: the full path to `nekobox.exe`.

The project's normal private `.env` file remains in the repository root and is read by Fabrexa itself. Do not copy its contents into these helper files.

## Install the sign-in launcher

1. Configure `FABREXA_REPO` and, when required, `NEKORAY_EXE` as user environment variables.
2. Open the Windows Startup directory by running `shell:startup`.
3. Copy `Fabrexa-Autostart.vbs` into that directory.
4. Sign out and back in, or run the copied launcher once to test the complete flow.

Remove the copied VBS file from the Startup directory to disable this autostart path.

## Commands

Run the wrapper from this directory:

```powershell
fab.cmd status
fab.cmd start
fab.cmd stop
fab.cmd restart
fab.cmd logs
fab.cmd help
```

The `autostart` action is intended for the VBS launcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\fabrexa.ps1 autostart
```

## Runtime files

Runtime state is stored under `%LOCALAPPDATA%\Fabrexa` and is not part of the repository:

- `bot.pid` contains the active bot process ID.
- `bot.log` contains standard bot output.
- `bot-error.log` contains bot errors and timestamped autostart messages.

## Requirements

- Windows PowerShell
- Node.js
- Ollama
- Nekoray configured with a working VPN profile
- Installed project dependencies
- A valid private `.env` file in the repository root
