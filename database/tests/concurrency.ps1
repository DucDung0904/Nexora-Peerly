param([string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin')
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$testDirectory = Join-Path $taskRoot ('.local\concurrency-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory -Force | Out-Null
$testPsql = Join-Path $PgBin 'psql.exe'
$testUserA = [guid]::NewGuid().ToString()
$testUserB = [guid]::NewGuid().ToString()
$testProcessA = $null
$testProcessB = $null
function Invoke-TestSql([string]$Sql, [string]$Name) {
    $file = Join-Path $testDirectory ($Name + '.sql')
    [IO.File]::WriteAllText($file, $Sql, [Text.UTF8Encoding]::new($false))
    & $testPsql -X -w -q -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USERNAME -d $env:DB_NAME -v ON_ERROR_STOP=1 -f $file
    if ($LASTEXITCODE -ne 0) { throw "Concurrency SQL failed: $Name" }
}
function Start-TestSql([string]$Sql, [string]$Name) {
    $file = Join-Path $testDirectory ($Name + '.sql')
    [IO.File]::WriteAllText($file, $Sql, [Text.UTF8Encoding]::new($false))
    $arguments = @('-X','-w','-h',$env:DB_HOST,'-p',$env:DB_PORT,'-U',$env:DB_USERNAME,'-d',$env:DB_NAME,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-f',('"' + $file + '"'))
    return Start-Process -FilePath $testPsql -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $testDirectory "$Name.out") -RedirectStandardError (Join-Path $testDirectory "$Name.err")
}
try {
    Invoke-TestSql @"
INSERT INTO app_users(id,email,password_hash,display_name,birth_date) VALUES
('$testUserA','concurrency-$testUserA@example.invalid',chr(36)||'2b'||chr(36)||'12'||chr(36)||repeat('a',53),'Concurrency A','1990-01-01'),
('$testUserB','concurrency-$testUserB@example.invalid',chr(36)||'2b'||chr(36)||'12'||chr(36)||repeat('b',53),'Concurrency B','1990-01-01');
INSERT INTO dating_profiles(user_id,intent_code) VALUES ('$testUserA','LONG_TERM'),('$testUserB','LONG_TERM');
"@ 'setup'
    $testProcessA = Start-TestSql @"
BEGIN;
SET LOCAL statement_timeout = '10s';
SELECT lock_user_pair('$testUserA','$testUserB');
INSERT INTO blocks(blocker_id,blocked_id) VALUES ('$testUserA','$testUserB');
\echo BLOCK_WRITTEN
SELECT pg_sleep(2);
COMMIT;
"@ 'block'
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while (-not ((Get-Content -LiteralPath (Join-Path $testDirectory 'block.out') -Raw -ErrorAction SilentlyContinue) -match 'BLOCK_WRITTEN')) {
        if ($watch.Elapsed.TotalSeconds -gt 10 -or $testProcessA.HasExited) { throw 'Blocking transaction did not reach synchronization point.' }
        Start-Sleep -Milliseconds 50
    }
    $testProcessB = Start-TestSql @"
SET statement_timeout = '10s';
INSERT INTO dating_likes(sender_id,recipient_id) VALUES ('$testUserB','$testUserA');
"@ 'like'
    $testProcessA.WaitForExit()
    $testProcessB.WaitForExit()
    if ($testProcessA.ExitCode -ne 0) { throw 'Blocking transaction failed.' }
    $rejection = Get-Content -LiteralPath (Join-Path $testDirectory 'like.err') -Raw
    if ($testProcessB.ExitCode -eq 0 -or $rejection -notmatch '23514' -or $rejection -notmatch 'Blocked users') { throw 'A concurrent like was not rejected correctly after block commit.' }
    Invoke-TestSql @"
DO 'BEGIN
  IF EXISTS(SELECT FROM dating_likes WHERE sender_id = ''$testUserB'' AND recipient_id = ''$testUserA'')
  THEN RAISE EXCEPTION ''Concurrent blocked like survived''; END IF;
END';
"@ 'verify'
    Write-Host 'PASS: Concurrent block/like transactions serialize; no blocked like survives.'
} finally {
    if ($testProcessA -and -not $testProcessA.HasExited) { $testProcessA.WaitForExit() }
    if ($testProcessB -and -not $testProcessB.HasExited) { $testProcessB.WaitForExit() }
    Invoke-TestSql "DELETE FROM app_users WHERE id IN ('$testUserA','$testUserB');" 'cleanup'
    Write-Host 'Only the two generated test users were removed. Logs remain in .local/concurrency-*.'
}
