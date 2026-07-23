Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = dir

Set env = WshShell.Environment("PROCESS")
env("PR_SUBTITLE_DEVICE") = "cpu"

WshShell.Run "pr-subtitle-server.exe", 0, False
