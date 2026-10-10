param([ValidateRange(1024,65535)][int]$Port = 8787)
$ErrorActionPreference = 'Stop'
# Localhost-only static server; no dependencies, uploads, or signaling endpoints.
$labRoot = $PSScriptRoot
$labFiles = @{
    '/' = @('index.html', 'text/html; charset=utf-8')
    '/index.html' = @('index.html', 'text/html; charset=utf-8')
    '/app.js' = @('app.js', 'text/javascript; charset=utf-8')
    '/style.css' = @('style.css', 'text/css; charset=utf-8')
}
$labListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try {
    $labListener.Start()
    Write-Host "WebRTC lab: http://localhost:$Port"
    Write-Host 'Localhost only. Open two browser tabs/profiles, or run this folder separately on each computer.'
    Write-Host 'Press Ctrl+C to stop.'
    while ($true) {
        $labClient = $labListener.AcceptTcpClient()
        try {
            $labClient.ReceiveTimeout = 2000
            $labClient.SendTimeout = 2000
            $labStream = $labClient.GetStream()
            $labReader = [System.IO.StreamReader]::new($labStream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $labRequest = $labReader.ReadLine()
            if (-not $labRequest) { continue }
            $labHeaderBytes = 0
            do {
                $labHeader = $labReader.ReadLine()
                if ($null -ne $labHeader) { $labHeaderBytes += $labHeader.Length }
                if ($labHeaderBytes -gt 16384) { throw 'Request headers too large.' }
            } while ($labHeader)
            $labParts = $labRequest.Split(' ')
            $labPath = ($labParts[1] -split '\?')[0]
            $labStatus = '200 OK'
            $labType = 'text/plain; charset=utf-8'
            if ($labParts[0] -notin @('GET', 'HEAD')) {
                $labStatus = '405 Method Not Allowed'
                $labBody = [System.Text.Encoding]::UTF8.GetBytes('Static files only.')
            } elseif ($labFiles.ContainsKey($labPath)) {
                $labEntry = $labFiles[$labPath]
                $labType = $labEntry[1]
                $labBody = [System.IO.File]::ReadAllBytes((Join-Path $labRoot $labEntry[0]))
            } else {
                $labStatus = '404 Not Found'
                $labBody = [System.Text.Encoding]::UTF8.GetBytes('Not found.')
            }
            $labResponse = "HTTP/1.1 $labStatus`r`nContent-Type: $labType`r`nContent-Length: $($labBody.Length)`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
            $labHeaderBuffer = [System.Text.Encoding]::ASCII.GetBytes($labResponse)
            $labStream.Write($labHeaderBuffer, 0, $labHeaderBuffer.Length)
            if ($labParts[0] -ne 'HEAD') { $labStream.Write($labBody, 0, $labBody.Length) }
            $labStream.Flush()
        } catch {
            Write-Verbose 'Client disconnected or sent an invalid request.'
        } finally {
            if ($labReader) { $labReader.Dispose(); $labReader = $null }
            $labClient.Dispose()
        }
    }
} finally { $labListener.Stop() }
