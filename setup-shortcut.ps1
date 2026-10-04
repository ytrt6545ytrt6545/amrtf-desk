[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "大慈恩研討播控艙.lnk"

$targetBat = Join-Path $scriptDir "launch-amrtf-desk.bat"
if (-not (Test-Path $targetBat)) {
    $targetBat = Join-Path $scriptDir "AMRTF-Desk.bat"
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetBat
$shortcut.Arguments = ""
$shortcut.WorkingDirectory = $scriptDir
$shortcut.WindowStyle = 7
$shortcut.Description = "大慈恩官網獨立雙視窗播控艙"
$sysRoot = $env:SystemRoot
$shortcut.IconLocation = "$sysRoot\System32\shell32.dll,15"
$shortcut.Save()

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  大慈恩研討播控艙 桌面捷徑已建立完成！" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "捷徑位置：$shortcutPath" -ForegroundColor White
Write-Host "指向目標：$targetBat" -ForegroundColor Gray
Write-Host "現在可以直接在桌面上雙擊圖示開箱使用！" -ForegroundColor Yellow
Start-Sleep -Seconds 1
