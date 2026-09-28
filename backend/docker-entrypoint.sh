#!/bin/sh
set -e
attempts=0
until ./node_modules/.bin/prisma migrate deploy; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 15 ]; then
    echo "database migrations failed"
    exit 1
  fi
  echo "database not ready, retrying migrations"
  sleep 2
done
exec node dist/server.js
