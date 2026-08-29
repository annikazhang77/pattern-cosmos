$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'web\dist\index.html'))) {
    Push-Location (Join-Path $projectRoot 'web')
    try {
        npm run build
    }
    finally {
        Pop-Location
    }
}

$server = Start-Process -FilePath $python `
    -ArgumentList @('-m', 'uvicorn', 'web_api:app', '--host', '127.0.0.1', '--port', '8000', '--app-dir', $projectRoot) `
    -WindowStyle Hidden `
    -PassThru

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($server.HasExited) {
            throw "The local server exited before it became ready."
        }
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 1
            if ($health.status -eq 'ok') {
                $ready = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $ready) {
        throw "The local server did not become ready within 15 seconds."
    }
    Write-Host 'Pattern Cosmos is running at http://127.0.0.1:8000'
    Write-Host 'Press Ctrl+C to stop it.'
    if ($env:PATTERN_COSMOS_NO_BROWSER -ne '1') {
        Start-Process 'http://127.0.0.1:8000'
    }
    Wait-Process -Id $server.Id
}
finally {
    if (-not $server.HasExited) {
        Stop-Process -Id $server.Id
    }
}
