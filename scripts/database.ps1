param(
    [ValidateSet('init','start','stop','status','check','inspect','migrate','validate','info','test','test-concurrency','psql')]
    [string]$Action = 'status',
    [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin'
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskLocal = Join-Path $taskRoot '.local'
$taskData = Join-Path $taskLocal 'postgres'
$taskEnvPath = Join-Path $taskRoot '.env'
$taskSavedEnv = @{}

function Set-TaskEnvironment([string]$Name, [string]$Value) {
    if (-not $taskSavedEnv.ContainsKey($Name)) { $taskSavedEnv[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process') }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}
function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $([IO.Path]::GetFileName($Executable)) (exit $LASTEXITCODE)." }
}
function Get-TaskMaven {
    $mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if ($mavenCommand) { return $mavenCommand.Source }
    $toolRoot = Join-Path $taskLocal 'tools'
    $mavenPath = Join-Path $toolRoot 'apache-maven-3.9.11\bin\mvn.cmd'
    if (-not (Test-Path -LiteralPath $mavenPath)) {
        New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
        $archive = Join-Path $toolRoot 'apache-maven-3.9.11-bin.zip'
        $url = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.zip'
        Write-Host 'Downloading Maven 3.9.11 into .local/tools (SHA-512 verified)...'
        Invoke-WebRequest -Uri $url -OutFile $archive
        $expected = ([regex]::Match((Invoke-WebRequest -Uri "$url.sha512").Content, '[A-Fa-f0-9]{128}')).Value
        if (-not $expected -or (Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash -ne $expected) { throw 'Maven archive checksum mismatch.' }
        Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot -Force
    }
    return $mavenPath
}
function Invoke-TaskFlyway([string]$Goal) {
    $mavenPath = Get-TaskMaven
    Invoke-Checked $mavenPath @('-B','-ntp','-f',(Join-Path $taskRoot 'backend\pom.xml'),"flyway:$Goal")
}
function Start-TaskDatabase {
    if (-not (Test-Path -LiteralPath (Join-Path $taskData 'PG_VERSION'))) { throw 'Local cluster does not exist. Run: .\scripts\database.ps1 init' }
    & (Join-Path $PgBin 'pg_ctl.exe') -D $taskData status *> $null
    if ($LASTEXITCODE -eq 0) { Write-Host 'The project database is already running.'; return }
    & (Join-Path $PgBin 'pg_isready.exe') -h 127.0.0.1 -p $env:DB_PORT *> $null
    if ($LASTEXITCODE -eq 0) { throw "Port $env:DB_PORT is already occupied. No existing server was modified." }
    $taskStartArgs = @('-D',('"' + $taskData + '"'),'-l',('"' + (Join-Path $taskLocal 'postgres.log') + '"'),'-o',('"-h 127.0.0.1 -p ' + $env:DB_PORT + ' -c timezone=UTC"'),'-w','start')
    $taskStart = Start-Process -FilePath (Join-Path $PgBin 'pg_ctl.exe') -ArgumentList $taskStartArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLocal 'start.log') -RedirectStandardError (Join-Path $taskLocal 'start-error.log')
    # Start-Process -Wait would also wait for the long-lived postgres child tree.
    $taskStart.WaitForExit()
    if ($taskStart.ExitCode -ne 0) { throw 'PostgreSQL could not start. Check .local/postgres.log and .local/start-error.log.' }
    Write-Host "Project PostgreSQL started on 127.0.0.1:$env:DB_PORT."
}

try {
    if ($Action -eq 'init' -and -not (Test-Path -LiteralPath $taskEnvPath)) {
        $adminBytes = New-Object byte[] 32
        $appBytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($adminBytes); $rng.GetBytes($appBytes) } finally { $rng.Dispose() }
        $adminSecret = [BitConverter]::ToString($adminBytes).Replace('-','').ToLowerInvariant()
        $appSecret = [BitConverter]::ToString($appBytes).Replace('-','').ToLowerInvariant()
        $content = "POSTGRES_USER=peerly_admin`nPOSTGRES_PASSWORD=$adminSecret`nPOSTGRES_DB=postgres`nDB_HOST=127.0.0.1`nDB_PORT=5433`nDB_NAME=nexory_peerly`nDB_USERNAME=peerly`nDB_PASSWORD=$appSecret`n"
        [IO.File]::WriteAllText($taskEnvPath, $content, [Text.UTF8Encoding]::new($false))
        Write-Host 'Generated separate random credentials in ignored .env; passwords are not printed.'
    }
    if (-not (Test-Path -LiteralPath $taskEnvPath)) { throw 'Missing .env. Run .\scripts\database.ps1 init or copy .env.example and fill in credentials.' }
    foreach ($line in [IO.File]::ReadAllLines($taskEnvPath)) {
        if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { Set-TaskEnvironment $Matches[1] $Matches[2] }
    }
    foreach ($name in @('DB_HOST','DB_PORT','DB_NAME','DB_USERNAME','DB_PASSWORD','POSTGRES_USER','POSTGRES_PASSWORD')) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ([string]::IsNullOrWhiteSpace($value) -or $value.StartsWith('replace_with_')) { throw "Set a non-placeholder value for $name in .env." }
    }
    foreach ($name in @('DB_NAME','DB_USERNAME','POSTGRES_USER')) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw "Invalid SQL identifier in $name." }
    }
    if ($env:DB_PORT -notmatch '^\d+$' -or [int]$env:DB_PORT -lt 1024 -or [int]$env:DB_PORT -gt 65535) { throw 'Invalid DB_PORT.' }
    if ($env:DB_USERNAME -eq $env:POSTGRES_USER) { throw 'Application and administrator roles must be different.' }
    if ($Action -in @('init','start','stop','status') -and $env:DB_HOST -ne '127.0.0.1') { throw 'Cluster lifecycle commands only operate on this project local loopback database.' }
    if ($Action -notin @('migrate','validate','info') -and -not (Test-Path -LiteralPath (Join-Path $PgBin 'psql.exe'))) { throw 'PostgreSQL binaries not found. Supply -PgBin with your PostgreSQL 16+ bin directory.' }
    Set-TaskEnvironment 'PGCLIENTENCODING' 'UTF8'
    Set-TaskEnvironment 'PGPASSWORD' $env:DB_PASSWORD
    switch ($Action) {
        'init' {
            New-Item -ItemType Directory -Path $taskLocal -Force | Out-Null
            if (-not (Test-Path -LiteralPath (Join-Path $taskData 'PG_VERSION'))) {
                & (Join-Path $PgBin 'pg_isready.exe') -h 127.0.0.1 -p $env:DB_PORT *> $null
                if ($LASTEXITCODE -eq 0) { throw "Port $env:DB_PORT is in use. Change DB_PORT in .env before initializing." }
                $passwordFile = Join-Path $taskLocal '.initdb-password'
                try {
                    [IO.File]::WriteAllText($passwordFile, $env:POSTGRES_PASSWORD, [Text.UTF8Encoding]::new($false))
                    Invoke-Checked (Join-Path $PgBin 'initdb.exe') @('-D',$taskData,'-U',$env:POSTGRES_USER,'--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256',"--pwfile=$passwordFile")
                } finally { if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile } }
            }
            Start-TaskDatabase
            Set-TaskEnvironment 'PGPASSWORD' $env:POSTGRES_PASSWORD
            Invoke-Checked (Join-Path $PgBin 'psql.exe') @('-X','-w','-h',$env:DB_HOST,'-p',$env:DB_PORT,'-U',$env:POSTGRES_USER,'-d','postgres','-f',(Join-Path $taskRoot 'database\bootstrap.sql'))
            Set-TaskEnvironment 'PGPASSWORD' $env:DB_PASSWORD
            Invoke-TaskFlyway 'migrate'
        }
        'start' { Start-TaskDatabase }
        'stop' { Invoke-Checked (Join-Path $PgBin 'pg_ctl.exe') @('-D',$taskData,'-m','fast','-w','stop') }
        'status' { Invoke-Checked (Join-Path $PgBin 'pg_ctl.exe') @('-D',$taskData,'status') }
        'check' { Invoke-Checked (Join-Path $PgBin 'psql.exe') @('-X','-w','-h',$env:DB_HOST,'-p',$env:DB_PORT,'-U',$env:DB_USERNAME,'-d',$env:DB_NAME,'-v','ON_ERROR_STOP=1','-c',"SELECT current_database() AS database, current_user AS username, inet_server_addr() AS host, inet_server_port() AS port; SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';") }
        'inspect' { Invoke-Checked (Join-Path $PgBin 'psql.exe') @('-X','-w','-h',$env:DB_HOST,'-p',$env:DB_PORT,'-U',$env:DB_USERNAME,'-d',$env:DB_NAME,'-v','ON_ERROR_STOP=1','-f',(Join-Path $taskRoot 'database\inspect.sql')) }
        'migrate' { Invoke-TaskFlyway 'migrate' }
        'validate' { Invoke-TaskFlyway 'validate' }
        'info' { Invoke-TaskFlyway 'info' }
        'test' { Invoke-Checked (Join-Path $PgBin 'psql.exe') @('-X','-w','-h',$env:DB_HOST,'-p',$env:DB_PORT,'-U',$env:DB_USERNAME,'-d',$env:DB_NAME,'-v','ON_ERROR_STOP=1','-f',(Join-Path $taskRoot 'database\tests\schema.sql')) }
        'test-concurrency' { & (Join-Path $taskRoot 'database\tests\concurrency.ps1') -PgBin $PgBin }
        'psql' { Invoke-Checked (Join-Path $PgBin 'psql.exe') @('-X','-h',$env:DB_HOST,'-p',$env:DB_PORT,'-U',$env:DB_USERNAME,'-d',$env:DB_NAME) }
    }
} finally {
    foreach ($entry in $taskSavedEnv.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process') }
}
