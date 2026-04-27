$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\coding-cli.lnk")
$Shortcut.TargetPath = "C:\project\coding-cli\dist\coding.exe"
$Shortcut.WorkingDirectory = "C:\project\coding-cli"
$Shortcut.Description = "Coding CLI"
$Shortcut.Save()
Write-Host "Startup shortcut created successfully!"
