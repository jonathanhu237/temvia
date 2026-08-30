FROM migrate/migrate:v4.19.1

COPY 000001_auth.up.sql 000001_auth.down.sql /migrations/
COPY migrate-entrypoint.sh /usr/local/bin/migrate-entrypoint.sh

ENTRYPOINT ["sh", "/usr/local/bin/migrate-entrypoint.sh"]
