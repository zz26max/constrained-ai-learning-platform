param(
    [int]$BackendPort = 8080,
    [int]$FrontendPort = 4173,
    [switch]$StopDb
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Stop-Port([int]$port, [string]$label) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) { Write-Host "$label（端口 $port）未在运行。"; return }
    foreach ($connection in $connections) {
        try {
            Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
            Write-Host "$label 已停止（PID $($connection.OwningProcess)）。" -ForegroundColor Green
        } catch {
            Write-Host "$label 停止失败：$($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Stop-Port $BackendPort '后端'
Stop-Port $FrontendPort '前端'

if ($StopDb) {
    Push-Location (Join-Path $root 'backend')
    try {
        docker compose --env-file .env stop db | Out-Host
        Write-Host '数据库容器已停止。' -ForegroundColor Green
    } finally { Pop-Location }
} else {
    Write-Host '数据库容器保持运行（需要一并停止请加 -StopDb）。'
}
