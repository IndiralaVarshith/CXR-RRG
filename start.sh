#!/usr/bin/env bash
# Starts the AI service (internal only) and the web/API server (public port).
set -e
cd /app/ml
gunicorn --workers 1 --threads 4 --timeout 180 --bind 127.0.0.1:8000 server:app &
ML_PID=$!
cd /app/backend
node server.js &
WEB_PID=$!
# stop the container if either process dies, so the host restarts it
wait -n $ML_PID $WEB_PID
exit 1
