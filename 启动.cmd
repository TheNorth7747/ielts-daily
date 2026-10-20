@echo off
chcp 65001 >nul
title 每日雅思 · 本地服务器
cd /d "%~dp0"

rem 站点已经打包成 app.bundle.js，双击 index.html 也能用。
rem 这个脚本做的是「起一个本地服务器再打开」，数据更稳（file:// 下部分浏览器会禁本地存储）。

where python >nul 2>nul
if %errorlevel%==0 (
  set SRV=python -m http.server 8000
  goto :run
)

where py >nul 2>nul
if %errorlevel%==0 (
  set SRV=py -m http.server 8000
  goto :run
)

where node >nul 2>nul
if %errorlevel%==0 (
  set SRV=node server.js
  goto :run
)

echo 没有找到 Python 或 Node。
echo 不要紧：直接双击 index.html 也能用（数据存在浏览器里）。
pause
goto :eof

:run
echo 正在后台启动本地服务器（http://127.0.0.1:8000）…
start "" /b %SRV%
timeout /t 2 >nul
start "" "http://127.0.0.1:8000"
echo.
echo 浏览器已打开。关闭这个窗口 = 停止服务器。
echo 如果 8000 端口被占用，改这一行里的端口号：set SRV=...
pause
