[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $appDir

# 優先使用專案目錄自帶的綠色 node.exe
$nodeExe = Join-Path $appDir "bin\node.exe"
if (-not (Test-Path $nodeExe)) {
    $nodeExe = "node"
}

# 啟動後台服務
Start-Process -FilePath $nodeExe -ArgumentList "server.mjs" -WorkingDirectory $appDir -WindowStyle Hidden

Write-Host "✅ 大慈恩研討播控艙已啟動！" -ForegroundColor Green
Start-Sleep -Seconds 1
