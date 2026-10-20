@echo off
setlocal
cd /d "%~dp0"

rem ============================================================
rem  ReadAny - Android debug control panel
rem  Double-click / no args  -> interactive panel:
rem    1) Full start   2) Metro only   3) Open App
rem    4) Stop all     5) View Metro log   6) View build log
rem    7) Exit
rem
rem  With args it runs directly:
rem    start-android-debug.bat -SkipInstall
rem    start-android-debug.bat -MetroOnly
rem    start-android-debug.bat -OpenApp
rem    start-android-debug.bat -ClearCache
rem    start-android-debug.bat -Port 8090
rem ============================================================

if /I "%~1"=="-?"    goto :help
if /I "%~1"=="/?"    goto :help
if /I "%~1"=="help"  goto :help

rem --- resolve PowerShell engine (pwsh preferred) ---
where pwsh >nul 2>nul
if %errorlevel%==0 (
    set "PWSH=pwsh"
) else if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" (
    set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
) else if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe" (
    set "PWSH=%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe"
) else (
    set "PWSH=powershell"
)

if not "%~1"=="" (
    set "PS1ARGS=%*"
    goto :exec_cli
)
goto :panel

:panel
cls
echo ==========================================================
echo   ReadAny - Debug Control Panel   (Metro port 8085)
echo ==========================================================
echo.
echo   1. Full start : build + install + Metro + open App
echo   2. Metro only
echo   3. Open App   : (Metro already running)
echo   4. Stop all   : close Metro + Gradle daemon
echo   5. View Metro log
echo   6. View build log
echo   7. Exit
echo   8. Clear cache + Full start
echo.
choice /c 12345678 /n /m "Select an action (1-8): "
if errorlevel 8 goto clear_cache
if errorlevel 7 exit /b 0
if errorlevel 6 goto :view_build
if errorlevel 5 goto :view_metro
if errorlevel 4 goto :stop
if errorlevel 3 set "PS1ARGS=-OpenApp" & goto :exec_gui
if errorlevel 2 set "PS1ARGS=-MetroOnly" & goto :exec_gui
set "PS1ARGS=" & goto :exec_gui

:exec_gui
%PWSH% -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-android-debug.ps1" %PS1ARGS%
echo.
echo [panel] done (exit code %ERRORLEVEL%). Returning to menu...
pause
goto :panel

:exec_cli
%PWSH% -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-android-debug.ps1" %PS1ARGS%
exit /b %ERRORLEVEL%

:stop
echo Stopping Metro on port 8085 ...
powershell -NoProfile -Command "& { $c = Get-NetTCPConnection -LocalPort 8085 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Write-Output ('   killed PID ' + $c.OwningProcess + ' - Metro stopped.') } catch { Write-Output ('   [WARN] cannot kill PID ' + $c.OwningProcess + ': ' + $_.Exception.Message) } } else { Write-Output '   port 8085 not in use - nothing to stop.' } }"
echo Stopping Gradle daemon ...
if exist "%~dp0packages\app-expo\android\gradlew.bat" (
    pushd "%~dp0packages\app-expo\android"
    call gradlew.bat --stop >nul 2>nul
    popd
)
echo    done.
echo.
echo Optional manual cleanup:
echo   adb kill-server                    stop adb server
echo   adb -s emulator-5554 emu kill      close emulator
pause
goto :panel

:view_metro
echo Showing Metro log (Ctrl+C to return to menu) ...
powershell -NoProfile -Command "Get-Content -Wait -Tail 40 '%~dp0packages\app-expo\metro.log'"
goto :panel

:view_build
if not exist "%~dp0packages\app-expo\build-debug.log" (
    echo No build log yet - run "Full start" (option 1) first.
    pause
    goto :panel
)
echo Showing build log (Ctrl+C to return to menu) ...
powershell -NoProfile -Command "Get-Content -Wait -Tail 40 '%~dp0packages\app-expo\build-debug.log'"
goto :panel

:help
echo ReadAny - Android debug control panel
echo.
echo   Double-click            : interactive panel (start / stop / view logs)
echo   start-android-debug.bat -SkipInstall   skip gradle install
echo   start-android-debug.bat -MetroOnly     only start Metro
echo   start-android-debug.bat -OpenApp       only open the App
echo   start-android-debug.bat -ClearCache    Metro with cleaned cache
echo   start-android-debug.bat -Port 8090     use a different Metro port
echo.
echo   In the panel: option 4 stops Metro + Gradle daemon; options 5/6
echo   tail the Metro / build logs (Ctrl+C returns to the menu).
echo.
pause
exit /b 0
:clear_cache
cls
echo ==========================================================
echo   Clearing all caches (Metro + Gradle + temp)...
echo ==========================================================
echo.

echo [1/4] Stopping Metro on port 8085 ...
powershell -NoProfile -Command "& { $c = Get-NetTCPConnection -LocalPort 8085 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Write-Output '   Metro stopped.' } catch { Write-Output '   [WARN] cannot kill: ' + $_.Exception.Message } } else { Write-Output '   port 8085 not in use.' } }"

echo [2/4] Stopping Gradle daemon ...
pushd "%~dp0packages\app-expo\android"
call gradlew.bat --stop >nul 2>nul
popd

echo [3/4] Cleaning Gradle build cache ...
pushd "%~dp0packages\app-expo\android"
call gradlew.bat clean >nul 2>nul
popd
echo    done.

echo [4/4] Cleaning Metro / temp caches ...
if exist "%~dp0packages\app-expo\node_modules\.cache" (
    rmdir /s /q "%~dp0packages\app-expo\node_modules\.cache" 2>nul
    echo    node_modules\.cache removed
)
if exist "%TEMP%\metro-*" (
    del /f /q "%TEMP%\metro-*" 2>nul
    echo    TEMP metro files removed
)
if exist "%TEMP%\react-*" (
    del /f /q "%TEMP%\react-*" 2>nul
    echo    TEMP react files removed
)
if exist "%TEMP%\haste-*" (
    del /f /q "%TEMP%\haste-*" 2>nul
    echo    TEMP haste files removed
)
echo    done.

echo.
echo [OK] All caches cleared. Starting full rebuild...
echo.
timeout /t 2 /nobreak >nul
%PWSH% -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-android-debug.ps1"
echo.
echo [panel] done (exit code %ERRORLEVEL%). Returning to menu...
pause
goto panel
