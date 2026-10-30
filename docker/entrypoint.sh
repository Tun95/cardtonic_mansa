#!/bin/sh
set -e

echo "[entrypoint] applying database migrations"
yarn --silent prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] seeding demo wallets (idempotent)"
  yarn --silent seed
fi

# `docker compose run --rm api yarn test` runs the given command after migrations;
# with no command we start the API.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
echo "[entrypoint] starting API"
exec node dist/main
