$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Riparazione Variabili d'Ambiente        " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "`n[1/2] Impostazione CLAUDE_CODE_GIT_BASH_PATH..." 
[Environment]::SetEnvironmentVariable("CLAUDE_CODE_GIT_BASH_PATH", "C:\Program Files\Git\bin\bash.exe", "User")
Write-Host "Fatto." -ForegroundColor Green

Write-Host "`n[2/2] Verifica e riparazione variabile Path..." 
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($null -eq $userPath) { $userPath = "" }

$requiredPaths = @(
    "C:\Program Files\PowerShell\7\",
    "C:\Windows\System32\WindowsPowerShell\v1.0\",
    "C:\Windows\System32\"
)

$modified = $false
foreach ($reqPath in $requiredPaths) {
    $cleanPath = $reqPath.TrimEnd('\')
    
    if (-not ($userPath -match [regex]::Escape($reqPath)) -and -not ($userPath -match [regex]::Escape($cleanPath))) {
        Write-Host "-> Aggiungo il percorso mancante: $reqPath" -ForegroundColor Yellow
        if ($userPath -ne "" -and -not $userPath.EndsWith(";")) {
            $userPath += ";"
        }
        $userPath += $reqPath
        $modified = $true
    }
}

if ($modified) {
    [Environment]::SetEnvironmentVariable("Path", $userPath, "User")
    Write-Host "Fatto! Variabile Path aggiornata con successo." -ForegroundColor Green
} else {
    Write-Host "Ottimo! I percorsi critici erano gia' presenti." -ForegroundColor Green
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host " OPERAZIONE COMPLETATA CON SUCCESSO!" -ForegroundColor Green
Write-Host " E' strettamente necessario RIAVVIARE COMPLETAMENTE VS Code," -ForegroundColor Yellow
Write-Host " oppure disconnettersi e ricollegarsi, per ricaricare le variabili." -ForegroundColor Yellow
Write-Host "==========================================`n" -ForegroundColor Cyan
