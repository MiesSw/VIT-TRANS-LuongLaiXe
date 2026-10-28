@echo off
title VIT TRANS - Luong lai xe
cd /d "%~dp0"
echo Dang khoi dong app...

rem Tim Python THAT: chay thu 1 lenh nho. Loi tat "python" dan sang Microsoft
rem Store (co san tren Windows khi chua cai Python) chay lenh nay se bao loi
rem nen bi bo qua, khong bi nhan nham la da cai Python.
set "PYCMD="
python -c "import sys" >nul 2>nul
if not errorlevel 1 set "PYCMD=python"
if not defined PYCMD (
  py -3 -c "import sys" >nul 2>nul
  if not errorlevel 1 set "PYCMD=py -3"
)
if not defined PYCMD goto nopython

%PYCMD% server.py
if errorlevel 1 (
  echo.
  echo App chua mo duoc - xem thong bao ben tren.
  pause
)
goto :eof

:nopython
echo.
echo Khong tim thay Python tren may nay.
echo Cai Python tai https://www.python.org/downloads/  ^(nho tick "Add python.exe to PATH" khi cai^), roi bam lai file nay.
pause
