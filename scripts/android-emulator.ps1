# Starts the BULO_Pixel Android emulator and opens the app in Expo Go.
# Run from Windows PowerShell after `npx expo start` is running in apps/mobile.
#   powershell -ExecutionPolicy Bypass -File \\wsl.localhost\ubuntu\home\user\bulo-app\scripts\android-emulator.ps1
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
Set-Location $env:LOCALAPPDATA

if (-not ((& $adb devices) -match 'emulator-\d+\s+device')) {
  Start-Process (Join-Path $sdk 'emulator\emulator.exe') -ArgumentList '-avd', 'BULO_Pixel', '-no-boot-anim'
  & $adb wait-for-device
  while ((& $adb shell getprop sys.boot_completed 2>$null) -notmatch '1') { Start-Sleep 3 }
}
# 10.0.2.2 is the host computer as seen from the emulator
& $adb shell am start -a android.intent.action.VIEW -d 'exp://10.0.2.2:8081' | Out-Null
'BULO opened in the emulator'
