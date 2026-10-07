param(
    [switch]$DatabaseOnly,
    [ValidateRange(1, 65535)]
    [int]$Port = 8080,
    [string]$JdkPath = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$backendDirectory = Split-Path -Path $PSScriptRoot -Parent
$localConfigPath = Join-Path $backendDirectory '.env'

function New-LocalPassword {
    # 仅用于这台开发机的独立数据库；真实密码不会出现在终端或提交文件中。
    $randomBytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
    return ([System.BitConverter]::ToString($randomBytes)).Replace('-', '').ToLowerInvariant()
}

if (-not (Test-Path -LiteralPath $localConfigPath)) {
    $templatePath = Join-Path $backendDirectory '.env.example'
    $configText = [System.IO.File]::ReadAllText($templatePath)
    $configText = $configText.Replace('DB_PASSWORD=', ('DB_PASSWORD=' + (New-LocalPassword)))
    $configText = $configText.Replace('MYSQL_ROOT_PASSWORD=', ('MYSQL_ROOT_PASSWORD=' + (New-LocalPassword)))
    $configStream = $null
    try {
        # CreateNew 不覆盖已有文件，避免两个首次启动进程写出不同密码。
        $configStream = [System.IO.File]::Open($localConfigPath,
            [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    } catch [System.IO.IOException] {
        if (-not (Test-Path -LiteralPath $localConfigPath)) { throw }
    }
    if ($null -ne $configStream) {
        try {
            $writer = New-Object System.IO.StreamWriter($configStream, (New-Object System.Text.UTF8Encoding($false)))
            try { $writer.Write($configText) } finally { $writer.Dispose() }
        } finally { $configStream.Dispose() }
        Write-Host '已创建本地 .env 并生成随机数据库密码；文件已被 Git 忽略。'
    }
}

# 显式把配置注入当前进程及其子进程，不执行 .env 中的文本，也不打印值。
$allowedKeys = @('SPRING_PROFILES_ACTIVE', 'DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'MYSQL_ROOT_PASSWORD')
foreach ($line in [System.IO.File]::ReadAllLines($localConfigPath)) {
    $trimmedLine = $line.Trim()
    if (-not $trimmedLine -or $trimmedLine.StartsWith('#')) { continue }
    $entry = $trimmedLine -split '=', 2
    if ($entry.Count -ne 2 -or $entry[0] -notin $allowedKeys) {
        throw '本地 .env 存在无效配置项，请对照 .env.example 检查。'
    }
    if ([string]::IsNullOrWhiteSpace($entry[1])) { throw ('请填写配置项：' + $entry[0]) }
    [System.Environment]::SetEnvironmentVariable($entry[0], $entry[1], 'Process')
}

Push-Location $backendDirectory
try {
    # Docker Desktop 需已启动。--wait 等待账号与数据库真正可查询后再启动 API。
    docker compose --env-file .env up -d --wait --wait-timeout 120 db
    if ($LASTEXITCODE -ne 0) { throw '本地数据库启动失败，请检查 Docker Desktop 和 3307 端口。' }
    if ($DatabaseOnly) {
        Write-Host 'MySQL 已就绪，监听 127.0.0.1:3307；可按 README 配置 IDEA 启动。'
        return
    }

    if (-not $JdkPath -or -not (Test-Path -LiteralPath (Join-Path $JdkPath 'bin/java.exe'))) {
        throw '请通过 -JdkPath 指定 JDK 21 安装目录，或配置 JAVA_HOME。'
    }
    $env:JAVA_HOME = $JdkPath
    $env:Path = (Join-Path $JdkPath 'bin') + ';' + $env:Path
    $env:SERVER_PORT = [string]$Port
    .\mvnw.cmd spring-boot:run
    if ($LASTEXITCODE -ne 0) { throw '后端启动失败，请检查 Maven 输出与 JDK 版本。' }
} finally {
    Pop-Location
}
