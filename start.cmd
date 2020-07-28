@echo off

if exist "./node_modules/" (
    goto launch
) else (
    echo Installing dependencies.
    call npm i
    cls
    goto launch
)

:launch
node bootstrap.js
timeout 5 > nul
goto launch
