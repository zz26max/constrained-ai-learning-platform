param(
    [switch]$DatabaseOnly,
    [switch]$InitializeAccounts,
    [switch]$InitializeDemoData,
    [ValidateRange(1, 65535)]
    [int]$Port = 8080,
    [string]$JdkPath = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$backendDirectory = Split-Path -Path $PSScriptRoot -Parent
$localConfigPath = Join-Path $backendDirectory '.env'

function Invoke-NativeCommand {
    # Windows PowerShell 5.1 在 ErrorActionPreference=Stop 下会把原生命令写到 stderr 的进度信息
    # 当成终止错误（docker compose 与 maven 都会这样输出），导致脚本在命令实际成功时中断。
    # 这里临时放行，只依据退出码判断成败。
    param([scriptblock]$Command)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command; return $LASTEXITCODE } finally { $ErrorActionPreference = $previousPreference }
}

if (([int]$DatabaseOnly.IsPresent + [int]$InitializeAccounts.IsPresent + [int]$InitializeDemoData.IsPresent) -gt 1) {
    throw '-DatabaseOnly、-InitializeAccounts 与 -InitializeDemoData 三个开关不能同时使用。'
}

function New-LocalPassword {
    # 仅用于这台开发机的数据库和演示账户；真实密码不出现在终端或提交文件中。
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

# 显式解析 KEY=value，不执行文本；保留密码两端的空格，不支持引号或插值语法。
$accountKeys = @('LOCAL_STUDENT_PASSWORD', 'LOCAL_TEACHER_PASSWORD', 'LOCAL_ADMIN_PASSWORD')
$optionalKeys = @('AUTH_PRE_LOGIN_SIGNING_KEY', 'AUTH_ALLOWED_ORIGINS', 'AUTH_COOKIE_SECURE', 'AUTH_INVITE_SIGNING_KEY', 'AI_EXTERNAL_ENABLED', 'AI_DATA_APPROVED', 'AI_PROVIDER_ENDPOINT', 'AI_PROVIDER_KEY', 'AI_PROVIDER_MODEL', 'AI_WORKER_ENABLED', 'AI_RETENTION_CLEANUP_ENABLED', 'HELP_RETENTION_ENABLED', 'ANALYTICS_RETENTION_ENABLED', 'CHECKS_ENABLED', 'CHECKS_WEB_IMAGE', 'CHECKS_MYSQL_IMAGE')
$requiredKeys = @('SPRING_PROFILES_ACTIVE', 'DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'MYSQL_ROOT_PASSWORD')
$allowedKeys = $requiredKeys + $accountKeys + $optionalKeys
$configValues = @{}
# 独占文件后再补充随机密码，避免并发初始化写出不同的口令；已有值始终保留。
$configStream = [System.IO.File]::Open($localConfigPath,
    [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
    $reader = New-Object System.IO.StreamReader($configStream, [System.Text.Encoding]::UTF8, $true, 1024, $true)
    try { $configText = $reader.ReadToEnd() } finally { $reader.Dispose() }
    foreach ($line in ($configText -split '\r?\n')) {
        if (-not $line.Trim() -or $line.TrimStart().StartsWith('#')) { continue }
        $entry = $line -split '=', 2
        if ($entry.Count -ne 2 -or $entry[0] -notin $allowedKeys -or $configValues.ContainsKey($entry[0])) {
            throw '本地 .env 存在无效或重复配置项，请对照 .env.example 检查。'
        }
        $configValues[$entry[0]] = $entry[1]
    }
    foreach ($key in $requiredKeys) {
        if ([string]::IsNullOrWhiteSpace($configValues[$key])) { throw ('请填写配置项：' + $key) }
    }
    $changed = $false
    # 邀请码摘要需要稳定密钥：缺失时只生成一次并保存在忽略的 .env，重启不轮换。
    if ([string]::IsNullOrWhiteSpace($configValues['AUTH_INVITE_SIGNING_KEY'])) {
        $signingKey = New-LocalPassword
        if ($configValues.ContainsKey('AUTH_INVITE_SIGNING_KEY')) {
            $configText = $configText -replace '(?m)^AUTH_INVITE_SIGNING_KEY=[^\r\n]*', ('AUTH_INVITE_SIGNING_KEY=' + $signingKey)
        } else {
            $configText = $configText.TrimEnd("`r", "`n") + "`r`nAUTH_INVITE_SIGNING_KEY=" + $signingKey + "`r`n"
        }
        $configValues['AUTH_INVITE_SIGNING_KEY'] = $signingKey
        $changed = $true
    }
    if ($InitializeAccounts -or $InitializeDemoData) {
        # 初始化命令只操作约定的本地开发库，避免误连远程环境。
        if ($configValues['DB_URL'] -notmatch '^jdbc:mysql://(127\.0\.0\.1|localhost):3307/learning_platform(?:\?.*)?$') {
            throw '一次性初始化仅允许本地 3307 端口的 learning_platform 开发库。'
        }
    }
    if ($InitializeAccounts) {
        foreach ($key in $accountKeys) {
            if ([string]::IsNullOrWhiteSpace($configValues[$key])) {
                $password = New-LocalPassword
                if ($configValues.ContainsKey($key)) {
                    $configText = $configText -replace ('(?m)^' + $key + '=[^\r\n]*'), ($key + '=' + $password)
                } else {
                    $configText = $configText.TrimEnd("`r", "`n") + "`r`n" + $key + '=' + $password + "`r`n"
                }
                $configValues[$key] = $password
                $changed = $true
            }
        }
    }
    if ($changed) {
        $configStream.Position = 0
        $writer = New-Object System.IO.StreamWriter($configStream, (New-Object System.Text.UTF8Encoding($false)), 1024, $true)
        try { $writer.Write($configText); $writer.Flush(); $configStream.SetLength($configStream.Position) }
        finally { $writer.Dispose() }
        Write-Host '本地随机凭据已保存到 .env；终端不会显示密码或密钥。'
    }
} finally { $configStream.Dispose() }
foreach ($key in $allowedKeys) {
    if (-not $configValues.ContainsKey($key) -or ($key -in $optionalKeys -and [string]::IsNullOrWhiteSpace($configValues[$key]))) {
        Remove-Item -LiteralPath ('Env:' + $key) -ErrorAction SilentlyContinue
    } else {
        [System.Environment]::SetEnvironmentVariable($key, $configValues[$key], 'Process')
    }
}
$configuredProfile = $env:SPRING_PROFILES_ACTIVE

Push-Location $backendDirectory
try {
    # Docker Desktop 需已启动。--wait 等待账号与数据库真正可查询后再启动 API。
    # Out-Host 把子命令输出直接打印，避免它进入函数输出流、把退出码变成数组而误判失败。
    $composeExitCode = Invoke-NativeCommand { docker compose --env-file .env up -d --wait --wait-timeout 120 db | Out-Host }
    if ($composeExitCode -ne 0) { throw '本地数据库启动失败，请检查 Docker Desktop 和 3307 端口。' }
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
    if ($InitializeAccounts) { $env:SPRING_PROFILES_ACTIVE = 'local-accounts' }
    if ($InitializeDemoData) { $env:SPRING_PROFILES_ACTIVE = 'local-demo-data' }
    $serverExitCode = Invoke-NativeCommand { .\mvnw.cmd spring-boot:run | Out-Host }
    if ($serverExitCode -ne 0) { throw '后端启动失败，请检查 Maven 输出与 JDK 版本。' }
} finally {
    # 避免一次性命令影响同一终端后续启动的 API。
    $env:SPRING_PROFILES_ACTIVE = $configuredProfile
    Pop-Location
}
