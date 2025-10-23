@echo off
REM =====================================
REM   DaeBotJS Update and Restart Script
REM =====================================
REM
REM This script:
REM   1. Gracefully stops the current bot
REM   2. Backs up the database
REM   3. Pulls latest code from GitHub
REM   4. Installs new dependencies
REM   5. Redeploys Discord commands
REM   6. Restarts the bot
REM
REM Usage: Simply run this file
REM =====================================

setlocal enabledelayedexpansion

REM Store script directory
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo.
echo =====================================
echo    DaeBotJS Update and Restart
echo =====================================
echo.

REM ============================================
REM Step 1: Stop current bot (if running)
REM ============================================
echo [1/6] Stopping current bot...
node scripts\graceful-shutdown.js
set SHUTDOWN_CODE=!errorlevel!

if !SHUTDOWN_CODE! EQU 0 (
    echo       Bot stopped successfully.
) else if !SHUTDOWN_CODE! EQU 1 (
    echo       No running bot found ^(this is ok^).
) else (
    echo       Warning: Bot may not have stopped cleanly.
    timeout /t 3 >nul
)
echo.

REM ============================================
REM Step 2: Backup database
REM ============================================
echo [2/6] Backing up database...

if exist "data\mythic_runs.db" (
    REM Create backup with timestamp
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
    for /f "tokens=1-2 delims=/: " %%a in ('time /t') do (set mytime=%%a%%b)
    set BACKUP_NAME=mythic_runs_backup_!mydate!_!mytime!.db

    copy "data\mythic_runs.db" "data\!BACKUP_NAME!" >nul 2>&1
    if !errorlevel! EQU 0 (
        echo       Database backed up to: data\!BACKUP_NAME!
    ) else (
        echo       Warning: Could not backup database.
    )
) else (
    echo       No database found ^(first run?^).
)
echo.

REM ============================================
REM Step 3: Update code from GitHub
REM ============================================
echo [3/6] Pulling latest code from GitHub...

REM Stash any local changes (like config.json)
echo       Stashing local changes...
git stash push -m "Auto-stash before update" >nul 2>&1

REM Save current commit hash for rollback reference
for /f "tokens=*" %%i in ('git rev-parse HEAD') do set OLD_COMMIT=%%i
echo       Current commit: !OLD_COMMIT:~0,7!

REM Pull latest code
git pull origin main
if !errorlevel! NEQ 0 (
    echo.
    echo       ERROR: Failed to pull from GitHub!
    echo       Please check your internet connection and git configuration.
    echo.
    pause
    exit /b 1
)

REM Get new commit hash
for /f "tokens=*" %%i in ('git rev-parse HEAD') do set NEW_COMMIT=%%i
echo       Updated to: !NEW_COMMIT:~0,7!

REM Restore local changes
echo       Restoring local changes...
git stash pop >nul 2>&1

echo       Code updated successfully!
echo.

REM ============================================
REM Step 4: Install dependencies
REM ============================================
echo [4/6] Installing dependencies...
call npm install
if !errorlevel! NEQ 0 (
    echo.
    echo       ERROR: Failed to install dependencies!
    echo       Please check the error messages above.
    echo.
    pause
    exit /b 2
)
echo       Dependencies installed successfully!
echo.

REM ============================================
REM Step 5: Deploy Discord commands
REM ============================================
echo [5/6] Deploying Discord slash commands...
node deploy-commands.js
if !errorlevel! NEQ 0 (
    echo.
    echo       ERROR: Failed to deploy commands!
    echo       Please check the error messages above.
    echo.
    pause
    exit /b 3
)
echo       Commands deployed successfully!
echo.

REM ============================================
REM Step 6: Start the bot
REM ============================================
echo [6/6] Starting bot...
echo.
echo =====================================
echo    Update Complete!
echo =====================================
echo.
echo Starting DaeBotJS in new window...
echo You can close this window after the bot starts.
echo.

REM Start bot in new window
start "DaeBotJS" node main.js

REM Wait a moment to see if bot starts successfully
timeout /t 3 >nul

echo.
echo Bot is starting...
echo Check the DaeBotJS window for startup messages.
echo.
echo Press any key to close this window...
pause >nul

exit /b 0
