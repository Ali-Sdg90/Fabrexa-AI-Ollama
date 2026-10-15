param(
    [ValidateSet("autostart", "start", "stop", "restart", "status", "logs", "help")]
    [string]$Action = "help"
)

$Repo = $env:FABREXA_REPO
$Nekoray = $env:NEKORAY_EXE

if (-not $Repo) {
    $candidateRepo = [System.IO.Path]::GetFullPath(
        (Join-Path $PSScriptRoot "..\..")
    )

    if (Test-Path (Join-Path $candidateRepo "bot.js")) {
        $Repo = $candidateRepo
    }
}

$StateDir = Join-Path $env:LOCALAPPDATA "Fabrexa"
$PidFile = Join-Path $StateDir "bot.pid"
$OutLog = Join-Path $StateDir "bot.log"
$ErrLog = Join-Path $StateDir "bot-error.log"

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

$Node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$Ollama = (Get-Command ollama.exe -ErrorAction SilentlyContinue).Source

if (-not $Ollama) {
    $candidate = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (Test-Path $candidate) {
        $Ollama = $candidate
    }
}

function Show-Notification {
    param(
        [string]$Title,
        [string]$Text
    )

    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        $notification = New-Object System.Windows.Forms.NotifyIcon
        $notification.Icon = [System.Drawing.SystemIcons]::Information
        $notification.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
        $notification.BalloonTipTitle = $Title
        $notification.BalloonTipText = $Text
        $notification.Visible = $true

        $notification.ShowBalloonTip(4000)
        Start-Sleep -Seconds 4

        $notification.Dispose()
    }
    catch {}
}

function Test-Telegram {
    if (-not $Node) {
        return $false
    }

    & $Node -e "
        fetch(
            'https://api.telegram.org',
            { signal: AbortSignal.timeout(5000) }
        )
        .then(() => process.exit(0))
        .catch(() => process.exit(1))
    " *> $null

    return $LASTEXITCODE -eq 0
}

function Write-AutostartLog {
    param(
        [string]$Level,
        [string]$Message
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $ErrLog -Value "[$timestamp] [$Level] $Message"
}

function Find-Nekoray {
    if ($Nekoray -and (Test-Path $Nekoray)) {
        return (Resolve-Path $Nekoray).Path
    }

    $command = Get-Command "nekobox.exe" -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    return $null
}

function Ensure-Nekoray {
    if (Get-Process -Name "nekobox" -ErrorAction SilentlyContinue) {
        return
    }

    $resolvedNekoray = Find-Nekoray

    if (-not $resolvedNekoray) {
        throw "Nekoray was not found. Set NEKORAY_EXE to its executable path."
    }

    Start-Process `
        -FilePath $resolvedNekoray `
        -ArgumentList "-tray" `
        -WindowStyle Hidden

    Write-AutostartLog "INFO" "Nekoray was started in tray mode."
}

function Wait-Telegram {
    $consecutiveSuccesses = 0
    $attempt = 0

    while ($consecutiveSuccesses -lt 2) {
        $attempt++

        if (Test-Telegram) {
            $consecutiveSuccesses++
        }
        else {
            $consecutiveSuccesses = 0
        }

        if ($consecutiveSuccesses -lt 2) {
            if ($attempt -eq 1 -or $attempt % 12 -eq 0) {
                Write-AutostartLog "INFO" "Waiting for stable Telegram access through Nekoray."
            }

            Start-Sleep -Seconds 5
        }
    }
}

function Test-Ollama {
    try {
        Invoke-RestMethod `
            -Uri "http://127.0.0.1:11434/api/tags" `
            -TimeoutSec 2 | Out-Null

        return $true
    }
    catch {
        return $false
    }
}

function Get-LoadedModels {
    try {
        $result = Invoke-RestMethod `
            -Uri "http://127.0.0.1:11434/api/ps" `
            -TimeoutSec 2

        return @($result.models | ForEach-Object { $_.name })
    }
    catch {
        return @()
    }
}

function Get-BotProcess {
    if (-not (Test-Path $PidFile)) {
        return $null
    }

    try {
        $processId = [int](Get-Content $PidFile -Raw)
        $processInfo = Get-CimInstance Win32_Process `
            -Filter "ProcessId = $processId" `
            -ErrorAction SilentlyContinue

        if (-not $processInfo -or $processInfo.CommandLine -notmatch "bot\.js") {
            Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
            return $null
        }

        return Get-Process -Id $processId -ErrorAction SilentlyContinue
    }
    catch {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        return $null
    }
}

function Ensure-Ollama {
    if (Test-Ollama) {
        return
    }

    if (-not $Ollama) {
        throw "Ollama was not found."
    }

    Start-Process `
        -FilePath $Ollama `
        -ArgumentList "serve" `
        -WindowStyle Hidden

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1

        if (Test-Ollama) {
            return
        }
    }

    throw "Ollama did not become ready."
}

function Start-Fabrexa {
    param(
        [switch]$SkipTelegramCheck
    )

    $existing = Get-BotProcess

    if ($existing) {
        Write-Host "Fabrexa is already running. PID: $($existing.Id)"
        return
    }

    if (-not $Node) {
        throw "Node.js was not found."
    }

    if (-not $Repo -or -not (Test-Path $Repo -PathType Container)) {
        throw "Fabrexa repository was not found. Set FABREXA_REPO to its directory."
    }

    if (-not (Test-Path (Join-Path $Repo "node_modules"))) {
        throw "node_modules is missing. Run npm ci first."
    }

    if (-not $SkipTelegramCheck -and -not (Test-Telegram)) {
        throw "Telegram is not reachable yet. Nekoray may not be connected."
    }

    Ensure-Ollama

    $process = Start-Process `
        -FilePath $Node `
        -ArgumentList "bot.js" `
        -WorkingDirectory $Repo `
        -WindowStyle Hidden `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog `
        -PassThru

    Set-Content -Path $PidFile -Value $process.Id

    Start-Sleep -Seconds 3

    if ($process.HasExited) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        throw "Fabrexa exited during startup. Check: $ErrLog"
    }

    Write-Host "Fabrexa started. PID: $($process.Id)"

    Show-Notification `
        "Fabrexa AI" `
        "Telegram is reachable and Fabrexa is online."
}

function Stop-Fabrexa {
    $process = Get-BotProcess

    if (-not $process) {
        Write-Host "Fabrexa is not running."
        return
    }

    Stop-Process -Id $process.Id -Force
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue

    Write-Host "Fabrexa stopped."
}

function Show-Status {
    $bot = Get-BotProcess
    $telegram = Test-Telegram
    $ollamaRunning = Test-Ollama

    Write-Host ""
    Write-Host "Fabrexa status"
    Write-Host "--------------"

    if ($bot) {
        Write-Host "Bot:       RUNNING (PID $($bot.Id))"
    }
    else {
        Write-Host "Bot:       STOPPED"
    }

    Write-Host "Telegram:  $(if ($telegram) { 'REACHABLE' } else { 'NOT REACHABLE' })"
    Write-Host "Ollama:    $(if ($ollamaRunning) { 'RUNNING' } else { 'STOPPED' })"

    if ($ollamaRunning) {
        $models = Get-LoadedModels

        if ($models.Count -gt 0) {
            Write-Host "Model:     LOADED"
            foreach ($model in $models) {
                Write-Host "           $model"
            }
        }
        else {
            Write-Host "Model:     UNLOADED (normal when idle)"
        }
    }

    Write-Host ""
    Write-Host "Logs:"
    Write-Host $OutLog
    Write-Host $ErrLog
}

function Show-Help {
    Write-Host ""
    Write-Host "Fabrexa CLI"
    Write-Host "-----------"
    Write-Host ""
    Write-Host "fab start      Start Fabrexa manually"
    Write-Host "fab stop       Stop Fabrexa"
    Write-Host "fab restart    Restart Fabrexa"
    Write-Host "fab status     Show current status"
    Write-Host "fab logs       Show recent logs"
    Write-Host "fab help       Show this help"
    Write-Host ""
}

switch ($Action) {
    "autostart" {
        $createdNew = $false
        $autostartMutex = New-Object System.Threading.Mutex(
            $true,
            "Local\FabrexaAutostart",
            [ref]$createdNew
        )

        if (-not $createdNew) {
            $autostartMutex.Dispose()
            break
        }

        try {
            if (Get-BotProcess) {
                break
            }

            # Windows starts Nekoray and this task at roughly the same time.
            # Make sure Nekoray is running, wait for a stable Telegram route,
            # and retry instead of losing the whole login attempt on a
            # transient failure.
            Ensure-Nekoray

            while ($true) {
                Wait-Telegram

                try {
                    Start-Fabrexa -SkipTelegramCheck
                    break
                }
                catch {
                    Write-AutostartLog "ERROR" $_.Exception.Message

                    Show-Notification `
                        "Fabrexa AI" `
                        "Fabrexa startup is retrying. Run: fab status"

                    Start-Sleep -Seconds 15
                }
            }
        }
        finally {
            $autostartMutex.ReleaseMutex()
            $autostartMutex.Dispose()
        }
    }

    "start" {
        Start-Fabrexa
    }

    "stop" {
        Stop-Fabrexa
    }

    "restart" {
        Stop-Fabrexa
        Start-Sleep -Seconds 1
        Start-Fabrexa
    }

    "status" {
        Show-Status
    }

    "logs" {
        Write-Host "`n--- Fabrexa output ---"
        if (Test-Path $OutLog) {
            Get-Content $OutLog -Tail 30
        }

        Write-Host "`n--- Fabrexa errors ---"
        if (Test-Path $ErrLog) {
            Get-Content $ErrLog -Tail 30
        }
    }

    "help" {
        Show-Help
    }
}

