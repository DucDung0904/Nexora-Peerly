param(
    [ValidateRange(1024,65535)][int]$Port = 8787,
    [string]$BrowserPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe',
    [switch]$CheckStun
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $BrowserPath)) { throw 'Browser not found; pass -BrowserPath with a Chrome or Edge executable.' }
$labProbe = Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing
if ($labProbe.StatusCode -ne 200) { throw 'Start serve.ps1 first.' }
$labProfile = Join-Path ([System.IO.Path]::GetTempPath()) ('nexory-webrtc-test-' + [guid]::NewGuid().ToString('N'))
$labBrowser = $null
$labSocket = $null
try {
    $labArguments = @('--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', "--user-data-dir=`"$labProfile`"", 'about:blank')
    $labBrowser = Start-Process -FilePath $BrowserPath -ArgumentList $labArguments -WindowStyle Hidden -PassThru
    $labDevTools = Join-Path $labProfile 'DevToolsActivePort'
    $labWait = [System.Diagnostics.Stopwatch]::StartNew()
    while (-not (Test-Path -LiteralPath $labDevTools)) {
        if ($labWait.Elapsed.TotalSeconds -gt 15) { throw 'Headless browser did not start DevTools.' }
        Start-Sleep -Milliseconds 100
    }
    $labDebugPort = (Get-Content -LiteralPath $labDevTools)[0]
    $labTargets = Invoke-RestMethod -Uri "http://127.0.0.1:$labDebugPort/json/list"
    $labTarget = $labTargets | Where-Object type -eq 'page' | Select-Object -First 1
    $labSocket = [System.Net.WebSockets.ClientWebSocket]::new()
    $null = $labSocket.ConnectAsync([uri]$labTarget.webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
    function Invoke-LabCdp([int]$Id, [string]$Method, [hashtable]$Parameters) {
        $labRequest = @{id=$Id; method=$Method; params=$Parameters} | ConvertTo-Json -Depth 20 -Compress
        $labBytes = [System.Text.Encoding]::UTF8.GetBytes($labRequest)
        $labSegment = [System.ArraySegment[byte]]::new($labBytes)
        $labCancel = [System.Threading.CancellationTokenSource]::new(90000)
        try {
            $labSocket.SendAsync($labSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $labCancel.Token).GetAwaiter().GetResult()
            while ($true) {
                $labMemory = [System.IO.MemoryStream]::new()
                try {
                    do {
                        $labBuffer = New-Object byte[] 65536
                        $labReceived = $labSocket.ReceiveAsync([System.ArraySegment[byte]]::new($labBuffer), $labCancel.Token).GetAwaiter().GetResult()
                        if ($labReceived.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { throw 'Browser disconnected.' }
                        $labMemory.Write($labBuffer, 0, $labReceived.Count)
                    } while (-not $labReceived.EndOfMessage)
                    $labReply = [System.Text.Encoding]::UTF8.GetString($labMemory.ToArray()) | ConvertFrom-Json
                } finally { $labMemory.Dispose() }
                if ($labReply.id -eq $Id) {
                    if ($labReply.error) { throw ($labReply.error | ConvertTo-Json -Compress) }
                    return $labReply.result
                }
            }
        } finally { $labCancel.Dispose() }
    }
    $null = Invoke-LabCdp 1 'Page.navigate' @{url="http://localhost:$Port"}
    $labReady = $false
    for ($labAttempt = 0; $labAttempt -lt 50; $labAttempt++) {
        $labCheck = Invoke-LabCdp 2 'Runtime.evaluate' @{expression="document.readyState === 'complete' && !!document.getElementById('self-test')"; returnByValue=$true}
        if ($labCheck.result.value -eq $true) { $labReady = $true; break }
        Start-Sleep -Milliseconds 100
    }
    if (-not $labReady) { throw 'Test page did not load.' }
    if ($CheckStun) { $null = Invoke-LabCdp 4 'Runtime.evaluate' @{expression='window.labCheckStun = true'} }
    $labTestCode = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-browser.js'))
    $labEvaluation = Invoke-LabCdp 3 'Runtime.evaluate' @{expression=$labTestCode; awaitPromise=$true; returnByValue=$true}
    if ($labEvaluation.exceptionDetails) { throw ($labEvaluation.exceptionDetails | ConvertTo-Json -Depth 10) }
    $labResult = $labEvaluation.result.value
    $labResult | ConvertTo-Json -Depth 25 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'test-results.json') -Encoding UTF8
    Write-Output "BROWSER_TEST_RESULT=$($labResult.result)"
    foreach ($labCase in $labResult.results) { Write-Output "$($labCase.result): $($labCase.test)" }
    if ($labResult.result -ne 'PASS') { throw ($labResult | ConvertTo-Json -Depth 20) }
} finally {
    if ($labSocket) {
        try { $null = Invoke-LabCdp 99 'Browser.close' @{} } catch {}
        $labSocket.Dispose()
    }
    if ($labBrowser -and -not $labBrowser.HasExited) { $labBrowser.WaitForExit(5000) | Out-Null }
    # Keep the isolated temp profile for inspection; never remove a user's existing browser profile.
    Write-Output "Isolated temporary browser profile: $labProfile"
}
