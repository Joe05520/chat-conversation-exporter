#!/bin/zsh
cd -- "${0:A:h}"
if command -v python3 >/dev/null 2>&1; then
  python3 server.py
else
  echo '需要 Python 3。請從 https://www.python.org/downloads/macos/ 安裝後重新開啟。'
  read -r '?按 Enter 關閉'
fi
