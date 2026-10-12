\set ON_ERROR_STOP on
SELECT current_database() AS database, current_user AS role, current_setting('server_version') AS postgres_version, current_setting('TimeZone') AS timezone, inet_server_addr() AS host, inet_server_port() AS port;
SELECT count(*) AS business_tables FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'flyway_schema_history';
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
SELECT 'app_users' AS entity, count(*) AS rows FROM app_users
UNION ALL SELECT 'auth_sessions',count(*) FROM auth_sessions
UNION ALL SELECT 'interests',count(*) FROM interest_catalog
UNION ALL SELECT 'social_goals_catalog',count(*) FROM social_goal_catalog
UNION ALL SELECT 'games',count(*) FROM game_catalog;
