$ErrorActionPreference = "Stop"

function Repair-PathScope {
    param([string]$Scope)
    
    $rawPath = [Environment]::GetEnvironmentVariable("Path", $Scope)
    if (-not $rawPath) { return }

    $paths = $rawPath -split ';'
    $cleanPaths = @()
    
    foreach ($p in $paths) {
        $trim = $p.Trim()
        if ($trim -eq "") { continue }
        if ($trim -like "CLAUDE_CODE_GIT_BASH_PATH=*") { continue }
        
        # Avoid duplicates
        $found = $false
        foreach ($cp in $cleanPaths) {
            if ($cp.ToLower() -eq $trim.ToLower()) {
                $found = $true
                break
            }
        }
        if (-not $found) {
            $cleanPaths += $trim
        }
    }

    if ($Scope -eq "Machine") {
        # Inject standard Windows paths at the beginning if missing
        $sysPaths = @(
            "C:\Windows\System32",
            "C:\Windows",
            "C:\Windows\System32\Wbem",
            "C:\Windows\System32\WindowsPowerShell\v1.0\"
        )
        $newClean = @()
        foreach ($sp in $sysPaths) {
            $newClean += $sp
        }
        foreach ($cp in $cleanPaths) {
            $found = $false
            foreach ($sp in $sysPaths) {
                if ($cp.ToLower() -eq $sp.ToLower() -or $cp.ToLower().TrimEnd('\') -eq $sp.ToLower().TrimEnd('\')) {
                    $found = $true
                    break
                }
            }
            if (-not $found) {
                $newClean += $cp
            }
        }
        $cleanPaths = $newClean
    }

    $finalPath = $cleanPaths -join ';'
    [Environment]::SetEnvironmentVariable("Path", $finalPath, $Scope)
    Write-Host "Repaired $Scope PATH. Length reduced from $($rawPath.Length) to $($finalPath.Length)."
}

Repair-PathScope -Scope "Machine"
Repair-PathScope -Scope "User"

Write-Host "PATH variables repaired successfully."
