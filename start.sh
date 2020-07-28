#!/bin/sh
DIR="./node_modules/"
if [ -d "$DIR" ]; then
  node bootstrap.js
  else
    echo "Installing dependencies." 
    npm i
    clear
    node bootstrap.js
fi
