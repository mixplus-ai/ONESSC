#!/usr/bin/env bash
# Builds the two files to paste into the demo project's SQL Editor:
#   1_schema.sql = all migrations   2_demo_data.sql = catalogue + training seeds + demo data
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-demo/out}"; mkdir -p "$OUT"
{ echo "-- One App SSC DEMO · ไฟล์ 1/2: โครงสร้างฐานข้อมูล (รันในโปรเจกต์สาธิตเท่านั้น)"
  for f in migrations/*.sql; do echo; echo "-- ===== $f"; cat "$f"; done; } > "$OUT/1_schema.sql"
{ echo "-- One App SSC DEMO · ไฟล์ 2/2: ข้อมูลตัวอย่าง (รันหลังไฟล์ 1 ในโปรเจกต์สาธิตเท่านั้น)"
  echo "do \$\$ begin if exists (select 1 from auth.users where email not like '%@ssc-demo.test') then raise exception 'หยุด: ฐานข้อมูลนี้มีบัญชีผู้ใช้จริง'; end if; end \$\$;"
  for f in seed/siamsolar_catalog.sql seed/cerssc_training.sql demo/demo_seed.sql; do echo; echo "-- ===== $f"; cat "$f"; done; } > "$OUT/2_demo_data.sql"
ls -la "$OUT"
