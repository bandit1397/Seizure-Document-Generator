@echo off
set "F=%~dp0index.html"
for %%P in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do if exist %%P (
  start "" %%P "%F%"
  exit /b
)
for %%E in (msedge.exe chrome.exe) do for %%K in (HKLM HKCU) do (
  for /f "tokens=2,*" %%A in ('%SystemRoot%\System32\reg.exe query "%%K\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\%%E" /ve 2^>nul ^| %SystemRoot%\System32\findstr.exe REG_SZ') do (
    if exist "%%~B" (
      start "" "%%~B" "%F%"
      exit /b
    )
  )
)
start "" "%F%"
