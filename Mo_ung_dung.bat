@echo off
title VIT TRANS - Luong lai xe
cd /d "%~dp0"
echo Dang khoi dong app...

rem Tim Python: "python" truoc, khong co thi "py" (Python Launcher cua Windows)
set "PYCMD="
where python >nul 2>nul && set "PYCMD=python"
if not defined PYCMD where py >nul 2>nul && set "PYCMD=py"
if not defined PYCMD goto nopython

%PYCMD% server.py
if errorlevel 1 (
  echo.
  echo App bi loi khi chay - xem dong bao loi ben tren.
  pause
)
goto :eof

:nopython
echo.
echo Khong tim thay Python tren may nay.
echo Cai Python tai https://www.python.org/downloads/  ^(nho tick "Add python.exe to PATH" khi cai^), roi bam lai file nay.
pause
