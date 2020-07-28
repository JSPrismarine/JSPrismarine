@echo off

if exist "./node_modules/" (
    goto launch
) else (
    echo Installing dependencies
    npm i
    goto launch
)

:launch
node bootstrap.js
timeout 5 > nul
goto launch
