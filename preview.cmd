@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Reading Tracker - Local Preview
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Please install Node.js first: https://nodejs.org/
  pause
  exit /b 1
)
node "%~dp0preview.js"
pause
