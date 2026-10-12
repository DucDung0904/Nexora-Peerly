param(
    [string]$DatabaseHost = '127.0.0.1',
    [ValidateRange(1,65535)][int]$Port = 5432,
    [string]$Database = 'nexory_peerly',
    [string]$Username = 'postgres',
    [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin'
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPsql = Join-Path $PgBin 'psql.exe'
if (-not (Test-Path -LiteralPath $taskPsql)) { throw 'psql.exe not found. Specify -PgBin.' }
foreach ($taskValue in @($DatabaseHost, $Database, $Username)) {
    if ([string]::IsNullOrWhiteSpace($taskValue) -or $taskValue -match '[\r\n]') { throw 'Invalid connection value.' }
}

Write-Host "Connect to ${DatabaseHost}:$Port / $Database as $Username. No database changes will be made."
$taskSecret = Read-Host 'PostgreSQL password (hidden)' -AsSecureString
$taskPointer = [IntPtr]::Zero
$taskOldPassword = $env:PGPASSWORD
$taskOldTimeout = $env:PGCONNECT_TIMEOUT
try {
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
    $taskPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    if ([string]::IsNullOrEmpty($taskPassword) -or $taskPassword -match '[\r\n]') { throw 'Enter a non-empty password without line breaks.' }
    $env:PGPASSWORD = $taskPassword
    $env:PGCONNECT_TIMEOUT = '5'
    & $taskPsql -X -w -h $DatabaseHost -p $Port -U $Username -d $Database -v ON_ERROR_STOP=1 -c "SELECT current_database() AS database, current_user AS username, inet_server_port() AS port; SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
    if ($LASTEXITCODE -ne 0) { throw 'Connection failed. Project configuration was not changed.' }

    $taskEnvPath = Join-Path $taskRoot '.env'
    $taskText = ''
    if (Test-Path -LiteralPath $taskEnvPath) {
        $taskText = [IO.File]::ReadAllText($taskEnvPath)
        $taskBackupDirectory = Join-Path $taskRoot '.local'
        New-Item -ItemType Directory -Path $taskBackupDirectory -Force | Out-Null
        $taskBackupPath = Join-Path $taskBackupDirectory ('.env.before-external-' + [guid]::NewGuid().ToString('N'))
        Copy-Item -LiteralPath $taskEnvPath -Destination $taskBackupPath
    }
    $taskSettings = [ordered]@{DB_HOST=$DatabaseHost; DB_PORT=[string]$Port; DB_NAME=$Database; DB_USERNAME=$Username; DB_PASSWORD=$taskPassword}
    foreach ($taskEntry in $taskSettings.GetEnumerator()) {
        $taskPattern = '(?m)^' + [regex]::Escape($taskEntry.Key) + '=[^\r\n]*'
        $taskLine = $taskEntry.Key + '=' + $taskEntry.Value
        if ([regex]::IsMatch($taskText, $taskPattern)) {
            $taskText = [regex]::Replace($taskText, $taskPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($taskMatch) $taskLine })
        } else {
            $taskText = $taskText.TrimEnd("`r", "`n") + "`n" + $taskLine + "`n"
        }
    }
    [IO.File]::WriteAllText($taskEnvPath, $taskText, [Text.UTF8Encoding]::new($false))
    Write-Host 'Connection succeeded. Saved connection settings in ignored .env; previous settings backed up in .local.'
} finally {
    $env:PGPASSWORD = $taskOldPassword
    $env:PGCONNECT_TIMEOUT = $taskOldTimeout
    if ($taskPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
    if ($taskSecret) { $taskSecret.Dispose() }
    $taskPassword = $null
}
