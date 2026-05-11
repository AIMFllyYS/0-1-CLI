# ================================================
# Source: 乐事学长 (third-party contribution)
# C Drive Cleanup Script
# ================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Convert-ToReadableSize {
    param([long]$Bytes)
    if ($Bytes -ge 1TB) { return "{0:N2} TB" -f ($Bytes / 1TB) }
    if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
    if ($Bytes -ge 1KB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
    return "$Bytes B"
}

function Read-MenuChoice {
    param(
        [string]$Prompt,
        [string[]]$ValidValues
    )
    while ($true) {
        $choice = Read-Host $Prompt
        if ($ValidValues -contains $choice) { return $choice }
        Write-Host "Invalid input. Please follow the prompt." -ForegroundColor Yellow
    }
}

function New-Candidate {
    param(
        [System.IO.FileInfo]$File,
        [string]$RuleName
    )
    [pscustomobject]@{
        FullName      = $File.FullName
        Size          = $File.Length
        Extension     = $File.Extension.ToLowerInvariant()
        LastWriteTime = $File.LastWriteTime
        Rule          = $RuleName
    }
}

function Get-ProtectionProfile {
    param([bool]$IncludeDownloads)

    $protectedRootPrefixes = @(
        "C:\Windows\System32",
        "C:\Windows\SysWOW64",
        "C:\Windows\WinSxS",
        "C:\Windows\servicing",
        "C:\Windows\Installer",
        "C:\Windows\Boot",
        "C:\Program Files",
        "C:\Program Files (x86)",
        "C:\ProgramData\Microsoft\Windows\Start Menu",
        "C:\Recovery"
    )

    $protectedFolders = @(
        "$env:USERPROFILE\Desktop",
        "$env:USERPROFILE\Documents",
        "$env:USERPROFILE\Pictures",
        "$env:USERPROFILE\Videos",
        "$env:USERPROFILE\Music",
        "C:\Users\Public\Documents",
        "C:\Users\Public\Pictures",
        "C:\Users\Public\Videos",
        "C:\Users\Public\Music"
    )

    if (-not $IncludeDownloads) {
        $protectedFolders += "$env:USERPROFILE\Downloads"
    }

    $protectedFileNames = @(
        "pagefile.sys",
        "hiberfil.sys",
        "swapfile.sys",
        "ntuser.dat",
        "bootmgr"
    )

    # Protect common user/business data and source formats.
    $protectedExtensions = @(
        ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf", ".txt", ".rtf", ".csv", ".md",
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic", ".raw", ".psd", ".ai",
        ".mp3", ".wav", ".flac", ".aac", ".ogg", ".mp4", ".mov", ".mkv", ".avi",
        ".zip", ".rar", ".7z", ".iso", ".tar", ".gz",
        ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rs", ".cs", ".cpp", ".c", ".h", ".sql", ".ipynb"
    )

    [pscustomobject]@{
        RootPrefixes       = $protectedRootPrefixes
        Folders            = $protectedFolders
        FileNames          = $protectedFileNames
        ProtectedExtensions = $protectedExtensions
    }
}

function Get-RuleProfile {
    param([string]$Mode)

    $commonSafePathRegex = @(
        "\\AppData\\Local\\Temp\\",
        "\\AppData\\Local\\Microsoft\\Windows\\INetCache\\",
        "\\AppData\\Local\\Microsoft\\Windows\\Explorer\\",
        "\\AppData\\Local\\CrashDumps\\",
        "\\AppData\\Local\\Packages\\.+\\LocalCache\\",
        "\\AppData\\Local\\Packages\\.+\\TempState\\",
        "\\AppData\\Roaming\\Code\\Cache\\",
        "\\AppData\\Roaming\\Code\\CachedData\\",
        "\\node_modules\\.cache\\",
        "\\npm-cache\\",
        "\\pip\\Cache\\",
        "\\cache\\",
        "\\temp\\",
        "\\tmp\\",
        "\\logs\\"
    )

    $ultraExtraSafePathRegex = @(
        "^C:\\Windows\\Temp\\",
        "^C:\\Windows\\Logs\\",
        "^C:\\Windows\\SoftwareDistribution\\Download\\",
        "^C:\\ProgramData\\Microsoft\\Windows\\WER\\",
        "^C:\\ProgramData\\Microsoft\\Windows Defender\\Scans\\History\\",
        "^C:\\ProgramData\\NVIDIA Corporation\\NV_Cache\\",
        "^C:\\ProgramData\\Package Cache\\",
        "^C:\\\`$Recycle\.Bin\\",
        "\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Code Cache\\",
        "\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\GPUCache\\",
        "\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Code Cache\\",
        "\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\GPUCache\\",
        "\\AppData\\Local\\D3DSCache\\"
    )

    $commonSafeExtensions = @(
        ".tmp", ".temp", ".old", ".bak", ".dmp", ".mdmp", ".etl", ".log", ".chk", ".gid", ".err",
        ".stackdump", ".crdownload", ".part", ".download"
    )

    $ultraExtraSafeExtensions = @(
        ".cache", ".blob", ".trace", ".wer", ".diagcab", ".cab"
    )

    if ($Mode -eq "Ultra") {
        return [pscustomobject]@{
            SafePathRegex   = @($commonSafePathRegex + $ultraExtraSafePathRegex)
            SafeExtensions  = @($commonSafeExtensions + $ultraExtraSafeExtensions)
            MinAgeDays      = 3
            MinSizeBytes    = 0
            MaxDeleteBytes  = 50GB
        }
    }

    return [pscustomobject]@{
        SafePathRegex   = $commonSafePathRegex
        SafeExtensions  = $commonSafeExtensions
        MinAgeDays      = 7
        MinSizeBytes    = 0
        MaxDeleteBytes  = 20GB
    }
}

function Is-ProtectedFile {
    param(
        [System.IO.FileInfo]$File,
        [pscustomobject]$Protection
    )

    $full = $File.FullName
    $lower = $full.ToLowerInvariant()
    $nameLower = $File.Name.ToLowerInvariant()
    $extLower = $File.Extension.ToLowerInvariant()

    foreach ($prefix in $Protection.RootPrefixes) {
        if ($lower.StartsWith($prefix.ToLowerInvariant())) { return $true }
    }

    foreach ($folder in $Protection.Folders) {
        if ($lower.StartsWith($folder.ToLowerInvariant())) { return $true }
    }

    if ($Protection.FileNames -contains $nameLower) { return $true }
    if ($Protection.ProtectedExtensions -contains $extLower) { return $true }
    return $false
}

function Scan-TargetPaths {
    param([object[]]$Targets)

    $result = New-Object System.Collections.Generic.List[object]
    foreach ($target in $Targets) {
        if (-not (Test-Path -LiteralPath $target.Path)) { continue }
        try {
            $files = if ($target.Recurse) {
                Get-ChildItem -LiteralPath $target.Path -Recurse -Force -File -ErrorAction SilentlyContinue
            } else {
                Get-ChildItem -LiteralPath $target.Path -Force -File -ErrorAction SilentlyContinue
            }
            foreach ($file in $files) {
                $result.Add((New-Candidate -File $file -RuleName $target.Name))
            }
        } catch {
            Write-Warning "Scan failed: $($target.Path) -> $($_.Exception.Message)"
        }
    }
    return ,$result.ToArray()
}

function Scan-FullDriveByRules {
    param(
        [string]$DriveRoot,
        [pscustomobject]$RuleProfile,
        [pscustomobject]$ProtectionProfile
    )

    $now = Get-Date
    $result = New-Object System.Collections.Generic.List[object]
    $processed = 0

    Get-ChildItem -LiteralPath $DriveRoot -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
        $file = $_
        $processed++
        if ($processed % 5000 -eq 0) {
            Write-Host ("Processed files: {0}" -f $processed) -ForegroundColor DarkGray
        }

        if (Is-ProtectedFile -File $file -Protection $ProtectionProfile) { return }

        $lower = $file.FullName.ToLowerInvariant()
        $ext = $file.Extension.ToLowerInvariant()
        $ageDays = ($now - $file.LastWriteTime).TotalDays

        $matchedPath = $false
        foreach ($regex in $RuleProfile.SafePathRegex) {
            if ($lower -match $regex.ToLowerInvariant()) {
                $matchedPath = $true
                break
            }
        }

        $matchedExt = $RuleProfile.SafeExtensions -contains $ext
        if (-not $matchedPath -and -not $matchedExt) { return }

        if ($ageDays -lt $RuleProfile.MinAgeDays) { return }
        if ($file.Length -lt $RuleProfile.MinSizeBytes) { return }
        if ($file.Length -gt $RuleProfile.MaxDeleteBytes) { return }

        $rule = if ($matchedPath) { "PathRule" } else { "ExtensionRule" }
        $result.Add((New-Candidate -File $file -RuleName $rule))
    }

    Write-Host ("Scan complete. Processed files: {0}" -f $processed) -ForegroundColor DarkGray
    return ,$result.ToArray()
}

function Get-StandardTargets {
    return @(
        [pscustomobject]@{ Name = "User temp"; Path = $env:TEMP; Recurse = $true },
        [pscustomobject]@{ Name = "System temp"; Path = "$env:SystemRoot\Temp"; Recurse = $true },
        [pscustomobject]@{ Name = "Windows update cache"; Path = "$env:SystemRoot\SoftwareDistribution\Download"; Recurse = $true },
        [pscustomobject]@{ Name = "Windows logs"; Path = "$env:SystemRoot\Logs"; Recurse = $true },
        [pscustomobject]@{ Name = "Windows prefetch"; Path = "$env:SystemRoot\Prefetch"; Recurse = $true },
        [pscustomobject]@{ Name = "Windows error reporting"; Path = "$env:ProgramData\Microsoft\Windows\WER"; Recurse = $true },
        [pscustomobject]@{ Name = "Edge cache"; Path = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"; Recurse = $true },
        [pscustomobject]@{ Name = "Chrome cache"; Path = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"; Recurse = $true },
        [pscustomobject]@{ Name = "Windows thumbnail cache"; Path = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"; Recurse = $true }
    )
}

function Get-AggressiveTargets {
    return @(
        [pscustomobject]@{ Name = "DirectX shader cache"; Path = "$env:LOCALAPPDATA\D3DSCache"; Recurse = $true },
        [pscustomobject]@{ Name = "NVIDIA DX cache"; Path = "$env:LOCALAPPDATA\NVIDIA\DXCache"; Recurse = $true },
        [pscustomobject]@{ Name = "NVIDIA GL cache"; Path = "$env:LOCALAPPDATA\NVIDIA\GLCache"; Recurse = $true },
        [pscustomobject]@{ Name = "System minidumps"; Path = "$env:SystemRoot\Minidump"; Recurse = $true },
        [pscustomobject]@{ Name = "Windows upgrade logs"; Path = "$env:SystemDrive\`$WINDOWS.~BT\Sources\Panther"; Recurse = $true },
        [pscustomobject]@{ Name = "Delivery optimization cache"; Path = "$env:SystemDrive\ProgramData\Microsoft\Windows\DeliveryOptimization\Cache"; Recurse = $true }
    )
}

function Remove-Candidates {
    param([object[]]$Candidates)

    $logs = New-Object System.Collections.Generic.List[object]
    $index = 0
    foreach ($candidate in $Candidates) {
        $index++
        if ($index % 2000 -eq 0) {
            Write-Host ("Deleted attempts: {0}/{1}" -f $index, $Candidates.Count) -ForegroundColor DarkGray
        }
        try {
            Remove-Item -LiteralPath $candidate.FullName -Force -ErrorAction SilentlyContinue
            $logs.Add([pscustomobject]@{
                Status = "Handled"
                Rule   = $candidate.Rule
                Path   = $candidate.FullName
            })
        } catch {
            $logs.Add([pscustomobject]@{
                Status = "Skipped/Failed"
                Rule   = $candidate.Rule
                Path   = $candidate.FullName
            })
        }
    }
    return ,$logs.ToArray()
}

Write-Host "================ C Drive Cleanup ================" -ForegroundColor Cyan
Write-Host "1. Conservative"
Write-Host "2. Aggressive"
Write-Host "3. Deep Scan (full drive + safe rules)"
Write-Host "4. Ultra Deep (max safe cleanup under control framework)"
Write-Host "0. Exit"
Write-Host ""

$modeChoice = Read-MenuChoice -Prompt "Choose mode (1/2/3/4/0)" -ValidValues @("1", "2", "3", "4", "0")
if ($modeChoice -eq "0") {
    Write-Host "Exit." -ForegroundColor Yellow
    exit 0
}

$includeDownloadsChoice = Read-MenuChoice -Prompt "Include Downloads folder? Y/N" -ValidValues @("Y", "y", "N", "n")
$includeDownloads = $includeDownloadsChoice.Trim().ToUpperInvariant() -eq "Y"

$candidates = @()
$modeName = ""

if ($modeChoice -eq "1") {
    $modeName = "Conservative"
    $targets = Get-StandardTargets
    if ($includeDownloads) {
        $targets += [pscustomobject]@{ Name = "Downloads optional"; Path = "$env:USERPROFILE\Downloads"; Recurse = $true }
    }
    $candidates = Scan-TargetPaths -Targets $targets
}
elseif ($modeChoice -eq "2") {
    $modeName = "Aggressive"
    $targets = @((Get-StandardTargets) + (Get-AggressiveTargets))
    if ($includeDownloads) {
        $targets += [pscustomobject]@{ Name = "Downloads optional"; Path = "$env:USERPROFILE\Downloads"; Recurse = $true }
    }
    $candidates = Scan-TargetPaths -Targets $targets
}
else {
    $modeName = if ($modeChoice -eq "4") { "Ultra Deep" } else { "Deep Scan" }
    Write-Host "Full C drive scan starting..." -ForegroundColor DarkYellow
    $ruleMode = if ($modeChoice -eq "4") { "Ultra" } else { "Deep" }
    $protection = Get-ProtectionProfile -IncludeDownloads $includeDownloads
    $rules = Get-RuleProfile -Mode $ruleMode
    $candidates = Scan-FullDriveByRules -DriveRoot "C:\" -RuleProfile $rules -ProtectionProfile $protection
}

if ($candidates.Count -eq 0) {
    Write-Host "No cleanup candidates found." -ForegroundColor Green
    exit 0
}

# Remove duplicates by path.
$seen = @{}
$dedup = New-Object System.Collections.Generic.List[object]
foreach ($c in $candidates) {
    $key = $c.FullName.ToLowerInvariant()
    if (-not $seen.ContainsKey($key)) {
        $seen[$key] = $true
        $dedup.Add($c)
    }
}
$candidates = $dedup.ToArray()

$grouped = $candidates | Group-Object -Property Rule | ForEach-Object {
    [pscustomobject]@{
        Rule  = $_.Name
        Files = $_.Count
        Size  = ($_.Group | Measure-Object -Property Size -Sum).Sum
    }
} | Sort-Object -Property Size -Descending

$totalBytes = ($candidates | Measure-Object -Property Size -Sum).Sum
$totalFiles = $candidates.Count

Write-Host ""
Write-Host "================ Scan Result ================" -ForegroundColor Cyan
Write-Host ("Mode: {0}" -f $modeName) -ForegroundColor Cyan
$grouped | Select-Object `
    @{Name = "Rule"; Expression = { $_.Rule } }, `
    @{Name = "Files"; Expression = { $_.Files } }, `
    @{Name = "Size"; Expression = { Convert-ToReadableSize $_.Size } } | Format-Table -AutoSize

Write-Host ""
Write-Host ("Estimated reclaimable space: {0} ({1} files)" -f (Convert-ToReadableSize $totalBytes), $totalFiles) -ForegroundColor Cyan
Write-Host "Top sample paths (first 80 by size):" -ForegroundColor Yellow
$candidates | Sort-Object -Property Size -Descending | Select-Object -First 80 `
    @{Name = "Size"; Expression = { Convert-ToReadableSize $_.Size } }, `
    @{Name = "Rule"; Expression = { $_.Rule } }, `
    @{Name = "Path"; Expression = { $_.FullName } } | Format-Table -AutoSize

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $PSScriptRoot ("cleanup-preview-{0}.csv" -f $timestamp)
$candidates | Sort-Object -Property Size -Descending | Select-Object `
    FullName,
    Size,
    @{Name = "ReadableSize"; Expression = { Convert-ToReadableSize $_.Size } },
    Extension,
    LastWriteTime,
    Rule | Export-Csv -Path $reportPath -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host ("Preview report exported: {0}" -f $reportPath) -ForegroundColor DarkCyan
Write-Host "Control workflow: review CSV first, then confirm delete." -ForegroundColor DarkYellow

$armDelete = Read-Host "Type DELETE to arm deletion, or anything else to cancel"
if ($armDelete -ne "DELETE") {
    Write-Host "Canceled." -ForegroundColor Yellow
    exit 0
}

$confirm = Read-Host "Press Enter or input Y to execute deletion"
if (-not [string]::IsNullOrWhiteSpace($confirm) -and $confirm.Trim().ToUpperInvariant() -ne "Y") {
    Write-Host "Canceled." -ForegroundColor Yellow
    exit 0
}

Write-Host "`nStarting cleanup..." -ForegroundColor Cyan
$deleteLogs = Remove-Candidates -Candidates $candidates

try {
    Clear-RecycleBin -DriveLetter C -Force -ErrorAction SilentlyContinue | Out-Null
    $deleteLogs += [pscustomobject]@{ Status = "Handled"; Rule = "RecycleBin"; Path = "Recycle Bin (C:)" }
} catch {
    $deleteLogs += [pscustomobject]@{ Status = "Skipped/Failed"; Rule = "RecycleBin"; Path = "Recycle Bin (C:)" }
}

Write-Host "`n================ Cleanup Result ================" -ForegroundColor Cyan
$deleteLogs | Group-Object -Property Status | Select-Object `
    @{Name = "Status"; Expression = { $_.Name } }, `
    @{Name = "Items"; Expression = { $_.Count } } | Format-Table -AutoSize

$resultPath = Join-Path $PSScriptRoot ("cleanup-result-{0}.csv" -f $timestamp)
$deleteLogs | Export-Csv -Path $resultPath -NoTypeInformation -Encoding UTF8
Write-Host ("Result report exported: {0}" -f $resultPath) -ForegroundColor DarkCyan
Write-Host "Tip: run PowerShell as Administrator and reboot after cleanup." -ForegroundColor Green
