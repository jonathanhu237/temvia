FROM migrate/migrate:v4.19.1

COPY 000001_auth.up.sql 000001_auth.down.sql 000002_password_recovery.up.sql 000002_password_recovery.down.sql 000003_rbac.up.sql 000003_rbac.down.sql 000004_system_settings.up.sql 000004_system_settings.down.sql 000005_operation_logs.up.sql 000005_operation_logs.down.sql 000006_operation_log_snapshots.up.sql 000006_operation_log_snapshots.down.sql 000007_system_identity.up.sql 000007_system_identity.down.sql 000008_postgres_state.up.sql 000008_postgres_state.down.sql 000009_abuse_protection.up.sql 000009_abuse_protection.down.sql /migrations/
COPY migrate-entrypoint.sh /usr/local/bin/migrate-entrypoint.sh

ENTRYPOINT ["sh", "/usr/local/bin/migrate-entrypoint.sh"]
