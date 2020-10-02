#!/bin/sh
DIR="./node_modules/"
if [ -d "$DIR" ]; then
  npm start
  else
    echo "Installing dependencies..." 
    npm i
    clear
    npm start
fi
