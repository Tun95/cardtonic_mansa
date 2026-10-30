#!/usr/bin/env bash
# Builds a conventional-commit history from the current working tree using YOUR git identity.
# Usage:  git config user.name "..." && git config user.email "..." && bash scripts/init-git.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d .git ] || git init -b main
git config user.name >/dev/null || { echo "Set git user.name / user.email first"; exit 1; }

c() { # c "<message>" <pathspec...>
  local msg="$1"; shift
  git add -- "$@" 2>/dev/null || true
  git diff --cached --quiet || git commit -q -m "$msg" && true
}

c "chore: scaffold NestJS + TypeScript (strict), Yarn, ESLint, Prettier, Jest" \
  package.json yarn.lock tsconfig.json tsconfig.build.json nest-cli.json .eslintrc.js .prettierrc .gitignore .dockerignore .env.example
c "feat(db): add Prisma schema, initial migration and demo seed" prisma
c "feat(common): add money helpers, validation decorators and error filter" \
  src/common src/prisma ':(exclude)*.spec.ts'
c "feat(fx): add triangulated FX rates with live provider, caching and stale/fixed fallbacks" \
  src/fx ':(exclude)*.spec.ts'
c "feat(ledger): add row-locking balance primitives and transactional idempotency" \
  src/ledger src/idempotency ':(exclude)*.spec.ts'
c "feat(transactions): add history listing with filters/pagination and lookup by id" \
  src/transactions ':(exclude)*.spec.ts'
c "feat(wallets): create wallets by email or phone and read balances with USD total" src/wallets
c "feat(deposits): add idempotent simulated deposits" src/deposits
c "feat(swaps): add idempotent cross-currency swaps" src/swaps
c "feat(transfers): add idempotent same/cross-currency transfers" src/transfers
c "feat(api): wire modules, bootstrap, health check and Swagger" \
  src/app.module.ts src/main.ts src/app.setup.ts src/swagger.ts src/health scripts/generate-openapi.ts
c "test: add unit tests for money, idempotency hashing and FX fallbacks" 'src/**/*.spec.ts'
c "test(e2e): add Supertest suite covering idempotency, concurrency and rollbacks" test
c "build(docker): add Dockerfile, compose stack, entrypoint and CI workflow" \
  Dockerfile docker docker-compose.yml .github scripts/init-git.sh
c "docs: add README and generated OpenAPI spec" README.md openapi.json
git add -A
git diff --cached --quiet || git commit -q -m "chore: add remaining files"
git log --oneline
