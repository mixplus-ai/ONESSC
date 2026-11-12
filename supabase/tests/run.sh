#!/usr/bin/env bash
# Runs the migrations + RLS tests against a throwaway local Postgres database.
# Usage: PGURL=postgres://postgres@localhost/postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL="${PGURL:-postgres://postgres@localhost/postgres}"
DB="onessc_test_$$"
psql "$PGURL" -qc "create database $DB" >/dev/null
trap 'psql "$PGURL" -qc "drop database if exists $DB" >/dev/null' EXIT
TARGET="${PGURL%/*}/$DB"
psql "$TARGET" -q -v ON_ERROR_STOP=1 -f tests/supabase_stub.sql >/dev/null
for f in migrations/*.sql; do psql "$TARGET" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
for t in tests/rls_test.sql tests/phase2_test.sql tests/phase3_test.sql tests/promo_test.sql tests/email_test.sql tests/phase4_test.sql tests/deliveries_test.sql tests/billing_test.sql tests/brand_points_test.sql tests/care_team_test.sql tests/price_test.sql tests/initplan_test.sql tests/sn_change_test.sql tests/claim_form_v2_test.sql tests/review_fixes_test.sql tests/claim_shipping_test.sql tests/solaredge_case_test.sql tests/stock_docs_test.sql tests/stock_links_test.sql tests/stock_count_test.sql; do psql "$TARGET" -q -v ON_ERROR_STOP=1 -f "$t" | tail -1; done
