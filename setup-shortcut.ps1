[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "大慈恩研討播控艙.lnk"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$scriptDir\run-silent.vbs`""
$shortcut.WorkingDirectory = $scriptDir
$shortcut.Description = "大慈恩官網獨立雙視窗播控艙"
$shortcut.Save()

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  🎉 大慈恩研討播控艙 桌面捷徑已建立完成！" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "📍 捷徑位置：$shortcutPath" -ForegroundColor White
Write-Host "💡 您現在可以直接在桌面上雙擊圖示開箱使用！`n" -ForegroundColor Yellow
Start-Sleep -Seconds 2
