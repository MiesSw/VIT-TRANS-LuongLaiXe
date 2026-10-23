@echo off
title VIT TRANS - Luong lai xe
cd /d "%~dp0"
echo Dang khoi dong app...
python server.py
if errorlevel 1 (
  py server.py
)
if errorlevel 1 (
  echo.
  echo Khong chay duoc server.py - may chua cai Python.
  echo Cai Python tai https://www.python.org/downloads/  ^(nho tick "Add python.exe to PATH" khi cai^), roi bam lai file nay.
  pause
)
