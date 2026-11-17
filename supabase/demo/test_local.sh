#!/usr/bin/env bash
# Local check: fresh DB → stub → migrations → catalog seeds → demo seed
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL="${PGURL:-postgres://postgres@localhost/postgres}"
DB="onessc_demo_$$"
psql "$PGURL" -qc "create database $DB" >/dev/null
trap 'psql "$PGURL" -qc "drop database if exists $DB" >/dev/null' EXIT
T="${PGURL%/*}/$DB"
psql "$T" -q -v ON_ERROR_STOP=1 -f tests/supabase_stub.sql -f demo/test_stub_extra.sql >/dev/null
for f in migrations/*.sql seed/siamsolar_catalog.sql seed/cerssc_training.sql; do psql "$T" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "FAIL $f"; exit 1; }; done
psql "$T" -q -v ON_ERROR_STOP=1 -f demo/demo_seed.sql 2>&1 | grep -v NOTICE
${KEEP:+psql "$PGURL" -qc "drop database if exists demo_keep" ; psql "$PGURL" -qc "create database demo_keep template $DB"}
