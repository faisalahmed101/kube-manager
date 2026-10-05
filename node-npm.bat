@echo off
set "NODE_DIR=C:\Programs\node-v24.19.0-win-x64\node-v24.19.0-win-x64"

if exist "%NODE_DIR%\node.exe" (
    set "PATH=%NODE_DIR%;%PATH%"
    echo Node.js Found Successfully!
) else (
    echo [ERROR] node.exe was not found in %NODE_DIR%
    echo Please check your folder location.
)

cd /d "%~dp0"
cmd /k