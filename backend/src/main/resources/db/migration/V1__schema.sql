-- PostgreSQL 16+; Flyway owns the transaction and checksum history.
-- Authentication, scoring, discovery filtering and API authorization remain backend duties.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE TABLE app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(254) NOT NULL CHECK (email = btrim(email) AND position('@' in email) > 1),
    password_hash varchar(60) NOT NULL CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
    display_name varchar(60) NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 60),
    birth_date date NOT NULL CHECK (birth_date <= (CURRENT_DATE - interval '18 years')::date),
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_users_email_ci_uq ON app_users (lower(email));
COMMENT ON COLUMN app_users.birth_date IS 'Private. Discovery APIs return calculated age, never birth_date. Self-declared date is not age verification.';
COMMENT ON COLUMN app_users.status IS 'Account status, not online presence.';
CREATE TRIGGER app_users_updated BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
    revoked_at timestamptz,
    last_used_at timestamptz,
    CHECK (expires_at > created_at),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at) WHERE revoked_at IS NULL;
COMMENT ON COLUMN auth_sessions.token_hash IS 'SHA-256 hex of a cryptographically random 256-bit bearer token; never store raw tokens. API checks expiry/revocation on every request.';

-- Catalogs are shared vocabulary; the selected data for the two modes remains separate.
CREATE TABLE interest_catalog (code varchar(40) PRIMARY KEY, label varchar(80) NOT NULL UNIQUE);
CREATE TABLE social_goal_catalog (code varchar(30) PRIMARY KEY, label varchar(80) NOT NULL UNIQUE);
CREATE TABLE game_catalog (code varchar(60) PRIMARY KEY, label varchar(100) NOT NULL UNIQUE, supports_crossplay boolean NOT NULL DEFAULT false);
CREATE TABLE platform_catalog (code varchar(30) PRIMARY KEY, label varchar(60) NOT NULL UNIQUE);
CREATE TABLE dating_intent_catalog (code varchar(40) PRIMARY KEY, label varchar(80) NOT NULL UNIQUE);
CREATE TABLE dating_value_catalog (code varchar(40) PRIMARY KEY, label varchar(80) NOT NULL UNIQUE);

INSERT INTO interest_catalog VALUES ('technology','Technology'),('gaming','Gaming'),('music','Music'),('anime','Anime'),('movies','Movies'),('books','Books'),('sports','Sports'),('art','Art');
INSERT INTO social_goal_catalog VALUES ('NEW_FRIENDS','Make new friends'),('TALK','Talk to someone'),('GAMING','Find a gaming partner');
INSERT INTO game_catalog VALUES ('genshin_impact','Genshin Impact',true),('valorant','VALORANT',false),('league_of_legends','League of Legends',false),('minecraft','Minecraft',false);
INSERT INTO platform_catalog VALUES ('PC','PC'),('PLAYSTATION','PlayStation'),('XBOX','Xbox'),('SWITCH','Nintendo Switch'),('MOBILE','Mobile');
INSERT INTO dating_intent_catalog VALUES ('LONG_TERM','Long-term relationship'),('SHORT_TERM','Short-term dating'),('EXPLORING','Still exploring');
INSERT INTO dating_value_catalog VALUES ('HONESTY','Honesty'),('KINDNESS','Kindness'),('FAMILY','Family'),('GROWTH','Personal growth'),('CREATIVITY','Creativity'),('INDEPENDENCE','Independence');

CREATE TABLE social_profiles (
    user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    bio varchar(500) NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT true,
    ready_to_connect boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN social_profiles.ready_to_connect IS 'User-declared availability. Not a verified online-presence signal.';
CREATE TRIGGER social_profiles_updated BEFORE UPDATE ON social_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE social_goals (
    user_id uuid NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
    goal_code varchar(30) NOT NULL REFERENCES social_goal_catalog(code),
    PRIMARY KEY (user_id, goal_code)
);
CREATE INDEX social_goals_lookup_idx ON social_goals(goal_code, user_id);
CREATE TABLE social_interests (
    user_id uuid NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
    interest_code varchar(40) NOT NULL REFERENCES interest_catalog(code),
    PRIMARY KEY (user_id, interest_code)
);
CREATE INDEX social_interests_lookup_idx ON social_interests(interest_code, user_id);
CREATE TABLE social_games (
    user_id uuid NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
    game_code varchar(60) NOT NULL REFERENCES game_catalog(code),
    platform_code varchar(30) NOT NULL REFERENCES platform_catalog(code),
    crossplay_enabled boolean NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, game_code, platform_code)
);
CREATE INDEX social_games_lookup_idx ON social_games(game_code, platform_code, user_id);

CREATE TABLE dating_profiles (
    user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    bio varchar(500) NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT false,
    visibility varchar(20) NOT NULL DEFAULT 'HIDDEN' CHECK (visibility IN ('HIDDEN','DISCOVERABLE')),
    intent_code varchar(40) NOT NULL REFERENCES dating_intent_catalog(code),
    preferred_min_age smallint NOT NULL DEFAULT 18,
    preferred_max_age smallint NOT NULL DEFAULT 99,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (preferred_min_age >= 18 AND preferred_max_age <= 120 AND preferred_min_age <= preferred_max_age)
);
CREATE INDEX dating_profiles_discovery_idx ON dating_profiles(intent_code, user_id) WHERE enabled AND visibility = 'DISCOVERABLE';
CREATE TRIGGER dating_profiles_updated BEFORE UPDATE ON dating_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE dating_interests (
    user_id uuid NOT NULL REFERENCES dating_profiles(user_id) ON DELETE CASCADE,
    interest_code varchar(40) NOT NULL REFERENCES interest_catalog(code),
    PRIMARY KEY (user_id, interest_code)
);
CREATE INDEX dating_interests_lookup_idx ON dating_interests(interest_code, user_id);
CREATE TABLE dating_values (
    user_id uuid NOT NULL REFERENCES dating_profiles(user_id) ON DELETE CASCADE,
    value_code varchar(40) NOT NULL REFERENCES dating_value_catalog(code),
    PRIMARY KEY (user_id, value_code)
);
CREATE INDEX dating_values_lookup_idx ON dating_values(value_code, user_id);
CREATE TABLE dating_accepted_intents (
    user_id uuid NOT NULL REFERENCES dating_profiles(user_id) ON DELETE CASCADE,
    intent_code varchar(40) NOT NULL REFERENCES dating_intent_catalog(code),
    PRIMARY KEY (user_id, intent_code)
);
CREATE INDEX dating_accepted_intents_lookup_idx ON dating_accepted_intents(intent_code, user_id);

CREATE TABLE blocks (
    blocker_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_reverse_idx ON blocks(blocked_id, blocker_id);
CREATE TABLE dating_likes (
    sender_id uuid NOT NULL REFERENCES dating_profiles(user_id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES dating_profiles(user_id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sender_id, recipient_id),
    CHECK (sender_id <> recipient_id)
);
CREATE INDEX dating_likes_incoming_idx ON dating_likes(recipient_id, sender_id);
CREATE TABLE dating_matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id uuid NOT NULL REFERENCES dating_profiles(user_id) ON DELETE CASCADE,
    user_b_id uuid NOT NULL REFERENCES dating_profiles(user_id) ON DELETE CASCADE,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED','BLOCKED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
);
CREATE INDEX dating_matches_b_idx ON dating_matches(user_b_id, status);
CREATE TRIGGER dating_matches_updated BEFORE UPDATE ON dating_matches FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mode varchar(16) NOT NULL CHECK (mode IN ('SOCIAL','RELATIONSHIP')),
    user_a_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    user_b_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    dating_match_id uuid UNIQUE REFERENCES dating_matches(id),
    status varchar(16) NOT NULL DEFAULT 'CONNECTING' CHECK (status IN ('CONNECTING','ACTIVE','ENDED','FAILED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    CHECK (user_a_id < user_b_id),
    CHECK ((mode = 'RELATIONSHIP' AND dating_match_id IS NOT NULL) OR (mode = 'SOCIAL' AND dating_match_id IS NULL)),
    CHECK ((status IN ('ENDED','FAILED')) = (ended_at IS NOT NULL)),
    CHECK (ended_at IS NULL OR ended_at >= created_at)
);
CREATE INDEX conversations_a_history_idx ON conversations(user_a_id, created_at DESC, id);
CREATE INDEX conversations_b_history_idx ON conversations(user_b_id, created_at DESC, id);
CREATE TABLE messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    client_message_id uuid NOT NULL,
    body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000 AND body ~ '[^[:space:]]'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, client_message_id)
);
CREATE INDEX messages_cursor_idx ON messages(conversation_id, created_at, id);
CREATE INDEX messages_sender_idx ON messages(sender_id);
COMMENT ON TABLE conversations IS 'Exactly two canonical participants. API must authorize both history reads and writes; ended conversations remain readable by members.';
COMMENT ON TABLE messages IS 'Server-readable history copy, not E2EE. Saved to DB is distinct from acknowledged delivery over DataChannel.';

-- Use the same ordered user-row locks for pair mutations. Backend must also use
-- this lock order before read-modify-write flows; discovery authorization stays in API.
CREATE FUNCTION lock_user_pair(first_id uuid, second_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM id FROM app_users WHERE id IN (first_id, second_id) ORDER BY id FOR UPDATE;
END;
$$;
CREATE FUNCTION users_blocked(first_id uuid, second_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT FROM blocks WHERE (blocker_id = first_id AND blocked_id = second_id) OR (blocker_id = second_id AND blocked_id = first_id));
$$;
CREATE FUNCTION guard_dating_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid; b uuid;
BEGIN
    IF TG_TABLE_NAME = 'dating_likes' THEN a := NEW.sender_id; b := NEW.recipient_id;
    ELSE a := NEW.user_a_id; b := NEW.user_b_id; END IF;
    PERFORM lock_user_pair(a, b);
    IF TG_TABLE_NAME = 'dating_matches' AND NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
    IF users_blocked(a, b) THEN RAISE EXCEPTION 'Blocked users cannot like or match' USING ERRCODE = '23514'; END IF;
    IF TG_TABLE_NAME = 'dating_matches' AND (
        NOT EXISTS (SELECT FROM dating_likes WHERE sender_id = a AND recipient_id = b)
        OR NOT EXISTS (SELECT FROM dating_likes WHERE sender_id = b AND recipient_id = a)
    ) THEN RAISE EXCEPTION 'An active dating match requires mutual likes' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER dating_likes_guard BEFORE INSERT OR UPDATE ON dating_likes FOR EACH ROW EXECUTE FUNCTION guard_dating_pair();
CREATE TRIGGER dating_matches_guard BEFORE INSERT OR UPDATE ON dating_matches FOR EACH ROW EXECUTE FUNCTION guard_dating_pair();

CREATE FUNCTION guard_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.user_a_id,NEW.user_b_id,NEW.mode,NEW.dating_match_id) IS DISTINCT FROM (OLD.user_a_id,OLD.user_b_id,OLD.mode,OLD.dating_match_id)
    THEN RAISE EXCEPTION 'Conversation participants and origin are immutable' USING ERRCODE = '23514'; END IF;
    PERFORM lock_user_pair(NEW.user_a_id, NEW.user_b_id);
    IF NEW.status IN ('CONNECTING','ACTIVE') AND users_blocked(NEW.user_a_id, NEW.user_b_id)
    THEN RAISE EXCEPTION 'Cannot open a conversation between blocked users' USING ERRCODE = '23514'; END IF;
    IF NEW.mode = 'RELATIONSHIP' AND NOT EXISTS (
        SELECT FROM dating_matches WHERE id = NEW.dating_match_id AND user_a_id = NEW.user_a_id AND user_b_id = NEW.user_b_id
    ) THEN RAISE EXCEPTION 'Conversation must belong to the matching pair' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER conversations_guard BEFORE INSERT OR UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION guard_conversation();

CREATE FUNCTION guard_message_sender() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room conversations%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Message history is append-only' USING ERRCODE = '23514'; END IF;
    SELECT * INTO room FROM conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown conversation' USING ERRCODE = '23503'; END IF;
    PERFORM lock_user_pair(room.user_a_id, room.user_b_id);
    SELECT * INTO room FROM conversations WHERE id = NEW.conversation_id FOR SHARE;
    IF NEW.sender_id NOT IN (room.user_a_id, room.user_b_id) THEN RAISE EXCEPTION 'Sender is not a participant' USING ERRCODE = '23514'; END IF;
    IF room.status <> 'ACTIVE' OR users_blocked(room.user_a_id, room.user_b_id)
    THEN RAISE EXCEPTION 'Conversation is not available for new messages' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER messages_sender_guard BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION guard_message_sender();

CREATE FUNCTION lock_block_pair() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM lock_user_pair(NEW.blocker_id, NEW.blocked_id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER blocks_pair_lock BEFORE INSERT OR UPDATE ON blocks FOR EACH ROW EXECUTE FUNCTION lock_block_pair();
CREATE FUNCTION apply_block() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE dating_matches SET status = 'BLOCKED' WHERE user_a_id = LEAST(NEW.blocker_id,NEW.blocked_id) AND user_b_id = GREATEST(NEW.blocker_id,NEW.blocked_id);
    DELETE FROM dating_likes WHERE (sender_id = NEW.blocker_id AND recipient_id = NEW.blocked_id) OR (sender_id = NEW.blocked_id AND recipient_id = NEW.blocker_id);
    UPDATE conversations SET status = 'ENDED', ended_at = clock_timestamp()
    WHERE user_a_id = LEAST(NEW.blocker_id,NEW.blocked_id) AND user_b_id = GREATEST(NEW.blocker_id,NEW.blocked_id) AND status IN ('CONNECTING','ACTIVE');
    RETURN NEW;
END;
$$;
CREATE TRIGGER blocks_apply AFTER INSERT OR UPDATE ON blocks FOR EACH ROW EXECUTE FUNCTION apply_block();
