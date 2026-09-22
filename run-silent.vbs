Set WshShell = CreateObject("WScript.Shell")
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = appDir

' 優先使用內建綠色 node，次選系統 node
Set fso = CreateObject("Scripting.FileSystemObject")
If fso.FileExists(appDir & "\bin\node.exe") Then
    nodeExe = """" & appDir & "\bin\node.exe"""
Else
    nodeExe = "node"
End If

' 以完全隱藏視窗 (0) 靜默執行，防毒 100% 白名單放行
WshShell.Run nodeExe & " """ & appDir & "\server.mjs""", 0, False
