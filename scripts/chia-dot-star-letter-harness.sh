#!/usr/bin/env bash
set -euo pipefail

# This runner only connects to a local disposable Supabase/Postgres instance.
# Start it with `supabase start` and replay the migrations with `supabase db reset`
# before running this script. Every fixture SQL file wraps its changes in a
# transaction and rolls them back.

if ! command -v psql >/dev/null 2>&1; then
  echo "chia harness: psql is required (install/use a local Supabase CLI runtime first)" >&2
  exit 2
fi

db_host="${CHIA_HARNESS_DB_HOST:-127.0.0.1}"
db_port="${CHIA_HARNESS_DB_PORT:-54322}"
db_user="${CHIA_HARNESS_DB_USER:-postgres}"
db_name="${CHIA_HARNESS_DB_NAME:-postgres}"

case "$db_host" in
  localhost|127.0.0.1|::1) ;;
  *) echo "chia harness: refusing non-local database host" >&2; exit 2 ;;
esac
case "$db_port" in
  ''|*[!0-9]*) echo "chia harness: port must be numeric" >&2; exit 2 ;;
esac
if [ "$db_name" != postgres ]; then
  echo "chia harness: database name must be the local disposable 'postgres' database" >&2
  exit 2
fi

export PGHOST="$db_host" PGPORT="$db_port" PGUSER="$db_user" PGDATABASE="$db_name"
# The local Supabase default is synthetic. Override only for a local installation
# with a different password; this value is never printed or persisted.
export PGPASSWORD="${CHIA_HARNESS_LOCAL_PASSWORD:-postgres}"

psql -X -v ON_ERROR_STOP=1 -Atqc "select case when inet_server_addr() is null or inet_server_addr() << inet '127.0.0.0/8' or inet_server_addr() = inet '::1' then 'local' else 'refuse' end" | grep -qx local || {
  echo "chia harness: connected server address is not loopback" >&2
  exit 2
}

psql -X -v ON_ERROR_STOP=1 -f supabase/tests/chia-person-memory-fencing-assertions.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/chia-star-letter-reply-assertions.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/chia-dot-atomic-guards-assertions.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/chia-dot-discovery-fairness-assertions.sql
echo "chia harness: synthetic SQL/RLS fixtures passed against local database"
