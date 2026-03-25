# Chess Opening Analyzer — start both servers cleanly
# Usage: right-click -> "Run with PowerShell", or: powershell -ExecutionPolicy Bypass -File start.ps1

$BACKEND_PORT = 8001
$FRONTEND_PORT = 5173

function Clear-Port($port) {
    $pids = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique
    foreach ($p in $pids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        Write-Host "Killed PID $p on port $port"
    }
}

Write-Host "Clearing ports $BACKEND_PORT and $FRONTEND_PORT..."
Clear-Port $BACKEND_PORT
Clear-Port $FRONTEND_PORT
Start-Sleep -Seconds 1

Write-Host "Starting backend on port $BACKEND_PORT..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; venv\Scripts\uvicorn main:app --reload --port $BACKEND_PORT"

Start-Sleep -Seconds 2

Write-Host "Starting frontend..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host "Done. Backend: http://localhost:$BACKEND_PORT  |  Frontend: http://localhost:$FRONTEND_PORT"
