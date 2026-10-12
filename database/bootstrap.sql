-- psql bootstrap, executed as a cluster administrator. NOT a Flyway migration.
-- Values come from the process environment, never from command-line passwords.
\set ON_ERROR_STOP on
\getenv db_name DB_NAME
\getenv db_user DB_USERNAME
\getenv db_password DB_PASSWORD
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', :'db_name', :'db_user', 'UTF8')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db_name') \gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', :'db_name', :'db_user') \gexec
SELECT format('ALTER ROLE %I IN DATABASE %I SET timezone TO %L', :'db_user', :'db_name', 'UTC') \gexec
