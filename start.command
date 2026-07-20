#!/bin/bash
cd "$(dirname "$0")"

echo "============================================"
echo "  Shiv Shakti Library - Library Cabin System"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on this computer."
  echo "Please install it from https://nodejs.org and run this file again."
  read -p "Press Enter to close..."
  exit 1
fi

if [ ! -f "backend/.env" ]; then
  echo
  echo "[Setup needed] backend/.env is missing."
  echo "Copy backend/.env.example to backend/.env and fill in your"
  echo "DATABASE_URL and JWT secrets, then double-click this file again."
  echo
  read -p "Press Enter to close..."
  exit 1
fi

[ -d "node_modules" ] || npm install
[ -d "backend/node_modules" ] || npm install --prefix backend
[ -d "frontend/node_modules" ] || npm install --prefix frontend

echo
echo "Running database migrations..."
npm run migrate

echo
echo "Starting the app. Keep this window open while you use the system."
echo "Once it says 'ready', open http://localhost:5173 in your browser."
echo

( sleep 3 && open http://localhost:5173 ) &
npm run dev
