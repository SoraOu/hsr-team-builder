@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 18 or newer is required. Install Node.js first.
 pause
 exit /b 1
)
if not exist combat-data.js (
 echo Missing combat-data.js. Extract this archive into your existing hsr-team-builder repository folder.
 pause
 exit /b 2
)
echo Generating kit data from StarRailRes...
node tools\build-params.js
if errorlevel 1 (
 echo Data generation failed. Check internet access or use node tools\build-params.js --local C:\path\to\data
 pause
 exit /b 1
)
echo Running synthetic regression tests...
node tests\run-tests.js
if errorlevel 1 (
 echo Tests failed. No rankings were generated.
 pause
 exit /b 1
)
echo Opening experimental optimizer...
start "" optimizer.html
exit /b 0
