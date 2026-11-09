# Builds the app, installs the debug APK on the USB-connected phone, and opens it.
# Usage (from 1locate/ or 1locate/admin/): npm run phone
param(
  [string]$Project = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

function Step([string]$Name, [scriptblock]$Command, [string]$Hint = '') {
  Write-Host "`n== $Name ==" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    Write-Host "$Name failed (exit code $LASTEXITCODE)." -ForegroundColor Red
    if ($Hint) { Write-Host $Hint -ForegroundColor Yellow }
    exit $LASTEXITCODE
  }
}

$buildHome = Join-Path $env:LOCALAPPDATA '1locate-build'
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $buildHome 'jdk21b\jdk-21.0.12.1+1' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME = Join-Path $buildHome 'gradle-home' }
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

foreach ($required in @("$env:JAVA_HOME\bin\java.exe", "$env:ANDROID_HOME\platform-tools\adb.exe")) {
  if (-not (Test-Path $required)) {
    Write-Host "Missing $required. Check the Java/Android SDK setup." -ForegroundColor Red
    exit 1
  }
}

$config = Join-Path $Project 'capacitor.config.ts'
$appId = if (Test-Path $config) {
  (Select-String -Path $config -Pattern "appId:\s*'([^']+)'").Matches.Groups[1].Value
}
if (-not $appId) {
  Write-Host "No appId found in $config. Run this from 1locate/ or 1locate/admin/." -ForegroundColor Red
  exit 1
}

$devices = adb devices | Select-String -Pattern "`tdevice$"
if (-not $devices) {
  Write-Host 'No authorized phone found. Connect the USB cable, turn on USB debugging, and tap Allow on the phone.' -ForegroundColor Red
  adb devices
  exit 1
}

Set-Location $Project
if (Test-Path (Join-Path $Project 'src\views\ARNavigationPage.vue')) {
  Step 'Mobile unit tests' { npx.cmd vitest run }
} else {
  Step 'Admin unit tests' { npm.cmd test }
}
Step 'Build web app' { npm.cmd run build }
Step 'Capacitor sync' { npx.cmd cap sync android }
Set-Location (Join-Path $Project 'android')
Step "Install $appId" { .\gradlew.bat installDebug } "If it says INSTALL_FAILED_UPDATE_INCOMPATIBLE, the phone has a build signed elsewhere (for example GitHub). Run: adb uninstall $appId  (deletes the app data), then npm run phone again."
Set-Location $Project
Step 'Open app' { adb shell monkey -p $appId 1 2>&1 | Out-Null }

Write-Host "`nInstalled and opened $appId." -ForegroundColor Green
