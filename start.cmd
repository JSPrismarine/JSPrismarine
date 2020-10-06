@echo off

where node.exe >nul 2>&1 && goto checkBeforeLaunch || goto nodeNotInstalled

:checkBeforeLaunch
if exist "./node_modules/" (
    goto launch
) else (
    echo Installing dependencies...
    call npm i
    cls
    goto launch
)

:nodeNotInstalled
echo You have to install Node.js
exit

:launch
node .
timeout 5 > nul
goto launch
