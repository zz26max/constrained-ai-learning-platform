param(
    [string]$JdkPath = $env:JAVA_HOME,
    [int]$BackendPort = 8080,
    [int]$FrontendPort = 4173,
    [switch]$SkipDb
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$envFile = Join-Path $backend '.env'

function Wait-Http([string]$url, [int]$seconds = 120) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing
            if ($response.StatusCode -eq 200) { return $true }
        } catch { }
        Start-Sleep -Seconds 3
    }
    return $false
}

function Test-Port([int]$port) {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

Write-Host '=== 学习平台 · 一键本地演示 ===' -ForegroundColor Cyan

if (-not $SkipDb) {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) { throw '未找到 docker，请先安装 Docker Desktop。' }
    $ready = $false
    try { docker info 2>$null | Out-Null; $ready = ($LASTEXITCODE -eq 0) } catch { }
    if (-not $ready) {
        Write-Host 'Docker 守护进程未运行，尝试启动 Docker Desktop…'
        $desktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
        if (-not (Test-Path -LiteralPath $desktop)) { throw 'Docker Desktop 未安装或路径不同，请手动启动后再运行。' }
        Start-Process -FilePath $desktop
        $deadline = (Get-Date).AddSeconds(180)
        while ((Get-Date) -lt $deadline) {
            try { docker info 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $ready = $true; break } } catch { }
            Start-Sleep -Seconds 5
        }
        if (-not $ready) { throw 'Docker Desktop 在 180 秒内未就绪。' }
    }
    if (-not (Test-Path -LiteralPath $envFile)) { throw '缺少 backend/.env，请先按 backend/.env.example 配置。' }
    Push-Location $backend
    try {
        docker compose --env-file .env up -d --wait --wait-timeout 120 db | Out-Host
        if ($LASTEXITCODE -ne 0) { throw '数据库容器启动失败。' }
    } finally { Pop-Location }
    Write-Host '数据库已就绪（127.0.0.1:3307）。' -ForegroundColor Green
}

if (Test-Port $BackendPort) {
    Write-Host "后端端口 $BackendPort 已被占用，跳过启动（如需重启请先运行 Stop-Demo.ps1）。" -ForegroundColor Yellow
} else {
    $backendCommand = "`$env:MAVEN_HOME='D:\tools\apache-maven-3.9.11'; Set-Location -LiteralPath '$backend'; & '.\scripts\Start-Local.ps1' -JdkPath '$JdkPath' -Port $BackendPort"
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand -WindowStyle Minimized
    Write-Host '后端已在最小化窗口启动，等待就绪…'
}

if (Test-Port $FrontendPort) {
    Write-Host "前端端口 $FrontendPort 已被占用，跳过启动。" -ForegroundColor Yellow
} else {
    $frontendCommand = "Set-Location -LiteralPath '$frontend'; npm run dev -- --port $FrontendPort"
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand -WindowStyle Minimized
    Write-Host '前端已在最小化窗口启动，等待就绪…'
}

$backendReady = Wait-Http "http://127.0.0.1:$BackendPort/health/ready" 180
$frontendReady = Wait-Http "http://127.0.0.1:$FrontendPort/" 120

Write-Host ''
if ($backendReady) { Write-Host "后端  http://127.0.0.1:$BackendPort  ready" -ForegroundColor Green } else { Write-Host '后端  未就绪，请看后端窗口日志' -ForegroundColor Red }
if ($frontendReady) { Write-Host "前端  http://127.0.0.1:$FrontendPort  打开即可演示" -ForegroundColor Green } else { Write-Host '前端  未就绪，请看前端窗口日志' -ForegroundColor Red }
Write-Host ''
Write-Host '演示账号：student.demo / teacher.demo / admin.demo（口令在 backend/.env，不要贴在演示材料里）'
Write-Host '个人模式入口：/register 选「个人自学」，注册后自动关联 Web 课程，含 2 份示例作业与 AI 辅导。'
Write-Host '停止：powershell -ExecutionPolicy Bypass -File scripts/Stop-Demo.ps1'
if (-not ($backendReady -and $frontendReady)) { exit 1 }
