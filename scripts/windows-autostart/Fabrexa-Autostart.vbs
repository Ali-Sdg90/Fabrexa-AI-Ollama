Set shell = CreateObject("WScript.Shell")
repoPath = shell.ExpandEnvironmentStrings("%FABREXA_REPO%")

If repoPath = "%FABREXA_REPO%" Or Len(Trim(repoPath)) = 0 Then
    WScript.Quit 1
End If

scriptPath = repoPath & "\scripts\windows-autostart\fabrexa.ps1"
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptPath & """ autostart", 0, False

