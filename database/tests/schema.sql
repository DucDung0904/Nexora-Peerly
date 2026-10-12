\set ON_ERROR_STOP on
\echo Testing schema in one rollback-only transaction; no test users are retained.
BEGIN;

CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
    RAISE NOTICE 'PASS: %', label;
END;
$$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
    BEGIN EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
        IF actual_state <> expected_state THEN RAISE EXCEPTION 'FAIL: %, expected SQLSTATE %, got %', label, expected_state, actual_state; END IF;
        RAISE NOTICE 'PASS: %', label;
        RETURN;
    END;
    RAISE EXCEPTION 'FAIL: % (invalid operation succeeded)', label;
END;
$$;

SELECT pg_temp.assert_true((SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole FROM pg_roles WHERE rolname = current_user), 'application owner is not a cluster superuser');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM flyway_schema_history WHERE version = '3' AND success), 'schema and pair-guard migrations applied');
SELECT pg_temp.assert_true((SELECT count(*) >= 8 FROM interest_catalog), 'interest catalog seeded');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM game_catalog WHERE code = 'genshin_impact'), 'README gaming example has a catalog entry');

INSERT INTO app_users(id,email,password_hash,display_name,birth_date) VALUES
('10000000-0000-0000-0000-000000000001','db-test-a@example.invalid','$2b$12$'||repeat('a',53),'SQL test A','1998-01-01'),
('20000000-0000-0000-0000-000000000002','db-test-b@example.invalid','$2b$12$'||repeat('b',53),'SQL test B','2000-01-01'),
('30000000-0000-0000-0000-000000000003','db-test-c@example.invalid','$2b$12$'||repeat('c',53),'SQL test C','2001-01-01');
SELECT pg_temp.expect_error($q$INSERT INTO app_users(email,password_hash,display_name,birth_date) VALUES ('DB-TEST-A@example.invalid','$2b$12$'||repeat('a',53),'Duplicate','1990-01-01')$q$,'23505','email uniqueness ignores case');
SELECT pg_temp.expect_error($q$INSERT INTO app_users(email,password_hash,display_name,birth_date) VALUES ('db-test-minor@example.invalid','$2b$12$'||repeat('a',53),'Minor',CURRENT_DATE - interval '17 years')$q$,'23514','under-18 registration rejected');
SELECT pg_temp.expect_error($q$INSERT INTO app_users(email,password_hash,display_name,birth_date) VALUES ('db-test-plain@example.invalid','plain-password','Plain','1990-01-01')$q$,'23514','plaintext password cannot be stored as a BCrypt hash');

INSERT INTO auth_sessions(user_id,token_hash) VALUES ('10000000-0000-0000-0000-000000000001',repeat('a',64));
SELECT pg_temp.assert_true((SELECT expires_at - created_at = interval '7 days' FROM auth_sessions WHERE token_hash = repeat('a',64)), 'sessions default to seven-day expiry');
SELECT pg_temp.expect_error($q$INSERT INTO auth_sessions(user_id,token_hash) VALUES ('10000000-0000-0000-0000-000000000001','raw-bearer-token')$q$,'23514','raw bearer tokens rejected');
SELECT pg_temp.expect_error($q$INSERT INTO auth_sessions(user_id,token_hash) VALUES ('10000000-0000-0000-0000-000000000001',repeat('a',64))$q$,'23505','duplicate session token hashes rejected');

INSERT INTO social_profiles(user_id) SELECT id FROM app_users WHERE email LIKE 'db-test-%@example.invalid';
INSERT INTO dating_profiles(user_id,intent_code) SELECT id,'LONG_TERM' FROM app_users WHERE email LIKE 'db-test-%@example.invalid';
SELECT pg_temp.assert_true((SELECT NOT enabled AND visibility = 'HIDDEN' FROM dating_profiles WHERE user_id = '10000000-0000-0000-0000-000000000001'), 'Relationship mode requires explicit opt-in');
INSERT INTO social_interests VALUES ('10000000-0000-0000-0000-000000000001','gaming');
INSERT INTO dating_interests VALUES ('10000000-0000-0000-0000-000000000001','books');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM dating_interests WHERE user_id = '10000000-0000-0000-0000-000000000001' AND interest_code = 'gaming'), 'Social selections do not leak into Relationship selections');
SELECT pg_temp.expect_error($q$INSERT INTO social_interests VALUES ('10000000-0000-0000-0000-000000000001','gaming')$q$,'23505','duplicate interests rejected');
SELECT pg_temp.expect_error($q$INSERT INTO social_interests VALUES ('10000000-0000-0000-0000-000000000001','unknown')$q$,'23503','unknown catalog values rejected');
SELECT pg_temp.expect_error($q$UPDATE dating_profiles SET preferred_min_age = 35, preferred_max_age = 25 WHERE user_id = '10000000-0000-0000-0000-000000000001'$q$,'23514','inverted age preferences rejected');
INSERT INTO social_goals VALUES ('10000000-0000-0000-0000-000000000001','GAMING');
INSERT INTO social_games VALUES ('10000000-0000-0000-0000-000000000001','genshin_impact','PC',true);

SELECT pg_temp.expect_error($q$INSERT INTO dating_likes(sender_id,recipient_id) VALUES ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$q$,'23514','self-like rejected');
INSERT INTO dating_likes(sender_id,recipient_id) VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error($q$INSERT INTO dating_matches(user_a_id,user_b_id) VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002')$q$,'23514','one-sided like cannot create an active match');
INSERT INTO dating_likes(sender_id,recipient_id) VALUES ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
INSERT INTO dating_matches(id,user_a_id,user_b_id) VALUES ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error($q$INSERT INTO dating_matches(user_a_id,user_b_id) VALUES ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001')$q$,'23514','canonical pair prevents reverse duplicate matches');

INSERT INTO conversations(id,mode,user_a_id,user_b_id,dating_match_id,status) VALUES ('50000000-0000-0000-0000-000000000005','RELATIONSHIP','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000004','ACTIVE');
INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000006','Xin chào 👋 — UTF-8 history');
SELECT pg_temp.expect_error($q$INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000006','Duplicate')$q$,'23505','message retry key prevents duplicate history');
SELECT pg_temp.expect_error($q$INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ('50000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000003',gen_random_uuid(),'Not a member')$q$,'23514','non-participant cannot write a message');
SELECT pg_temp.expect_error($q$INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',gen_random_uuid(),repeat('x',4001))$q$,'23514','message length is bounded');
SELECT pg_temp.expect_error($q$INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',gen_random_uuid(),E' \n\t ')$q$,'23514','whitespace-only messages rejected');
SELECT pg_temp.expect_error($q$UPDATE messages SET body = 'changed' WHERE client_message_id = '60000000-0000-0000-0000-000000000006'$q$,'23514','message authorship and history are immutable');

INSERT INTO profile_photos(user_id,mode,storage_key,content_type,size_bytes,is_primary) VALUES ('10000000-0000-0000-0000-000000000001','SOCIAL','tests/social-photo','image/png',256,true),('10000000-0000-0000-0000-000000000001','RELATIONSHIP','tests/relationship-photo','image/jpeg',512,true);
SELECT pg_temp.expect_error($q$INSERT INTO profile_photos(user_id,mode,storage_key,content_type,size_bytes,is_primary,sort_order) VALUES ('10000000-0000-0000-0000-000000000001','SOCIAL','tests/duplicate-primary','image/png',256,true,1)$q$,'23505','only one primary photo per user per mode');

INSERT INTO social_invites(id,sender_id,recipient_id,goal_code) VALUES ('70000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','TALK');
SELECT pg_temp.expect_error($q$INSERT INTO social_invites(sender_id,recipient_id,goal_code) VALUES ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','TALK')$q$,'23505','reverse pending invitation rejected');
SELECT pg_temp.expect_error($q$UPDATE social_invites SET status = 'ACCEPTED', resolved_at = clock_timestamp() WHERE id = '70000000-0000-0000-0000-000000000007'$q$,'23514','both parties must accept');
SELECT pg_temp.expect_error($q$INSERT INTO conversations(mode,user_a_id,user_b_id,social_invite_id) VALUES ('SOCIAL','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000007')$q$,'23514','pending invitation cannot open a Social conversation');
UPDATE social_invites SET status = 'ACCEPTED', recipient_accepted = true, resolved_at = clock_timestamp() WHERE id = '70000000-0000-0000-0000-000000000007';
INSERT INTO conversations(mode,user_a_id,user_b_id,social_invite_id,status) VALUES ('SOCIAL','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000007','ACTIVE');
SELECT pg_temp.expect_error($q$UPDATE social_invites SET status = 'PENDING', resolved_at = NULL WHERE id = '70000000-0000-0000-0000-000000000007'$q$,'23514','terminal invitations cannot be reopened');
SELECT pg_temp.expect_error($q$INSERT INTO social_invites(sender_id,recipient_id,goal_code,created_at,expires_at) VALUES ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','TALK',now()-interval '2 minutes',now()-interval '1 minute')$q$,'23514','already-expired pending invitations rejected');
INSERT INTO social_invites(sender_id,recipient_id,goal_code) VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','NEW_FRIENDS');

INSERT INTO blocks(blocker_id,blocked_id) VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM dating_likes WHERE sender_id IN ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002')), 'block removes likes in both directions');
SELECT pg_temp.assert_true((SELECT status = 'BLOCKED' FROM dating_matches WHERE id = '40000000-0000-0000-0000-000000000004'), 'block closes mutual match');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM conversations WHERE user_a_id = '10000000-0000-0000-0000-000000000001' AND status <> 'ENDED'), 'block ends active conversations in both modes');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM social_invites WHERE sender_id = '10000000-0000-0000-0000-000000000001' AND status = 'PENDING'), 'block cancels pending invitations');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM messages WHERE client_message_id = '60000000-0000-0000-0000-000000000006'), 'ending a conversation preserves history');
SELECT pg_temp.expect_error($q$INSERT INTO dating_likes(sender_id,recipient_id) VALUES ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001')$q$,'23514','blocked pair cannot like again');
SELECT pg_temp.expect_error($q$INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',gen_random_uuid(),'After block')$q$,'23514','ended or blocked conversations reject new messages');

DELETE FROM app_users WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM auth_sessions WHERE user_id = '10000000-0000-0000-0000-000000000001') AND NOT EXISTS(SELECT FROM messages WHERE client_message_id = '60000000-0000-0000-0000-000000000006'), 'explicit account deletion cascades through owned session and conversation data');
ROLLBACK;
\echo ALL SCHEMA TESTS PASSED. Test data rolled back.
