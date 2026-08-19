@echo off
cd /d "%~dp0"
start "" http://localhost:8460
node serve.mjs 8460
