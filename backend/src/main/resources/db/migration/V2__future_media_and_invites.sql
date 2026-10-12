CREATE TABLE profile_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    mode varchar(16) NOT NULL CHECK (mode IN ('SOCIAL','RELATIONSHIP')),
    storage_key varchar(512) NOT NULL UNIQUE CHECK (length(btrim(storage_key)) > 0),
    content_type varchar(30) NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
    sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9),
    is_primary boolean NOT NULL DEFAULT false,
    moderation_status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (moderation_status IN ('PENDING','APPROVED','REJECTED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, mode, sort_order)
);
CREATE UNIQUE INDEX profile_photos_primary_uq ON profile_photos(user_id, mode) WHERE is_primary;
COMMENT ON TABLE profile_photos IS 'Metadata only. Storage key is not a public URL; backend authorizes access and verifies actual bytes/type. No upload API or moderation engine is provided.';

CREATE TABLE social_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id uuid NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
    goal_code varchar(30) NOT NULL REFERENCES social_goal_catalog(code),
    sender_accepted boolean NOT NULL DEFAULT true,
    recipient_accepted boolean NOT NULL DEFAULT false,
    status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '45 seconds',
    resolved_at timestamptz,
    CHECK (sender_id <> recipient_id),
    CHECK (expires_at > created_at),
    CHECK ((status = 'PENDING') = (resolved_at IS NULL)),
    CHECK (resolved_at IS NULL OR resolved_at >= created_at),
    CHECK (status <> 'ACCEPTED' OR (sender_accepted AND recipient_accepted AND resolved_at <= expires_at))
);
CREATE UNIQUE INDEX social_invites_pending_pair_uq ON social_invites(LEAST(sender_id,recipient_id), GREATEST(sender_id,recipient_id)) WHERE status = 'PENDING';
CREATE INDEX social_invites_sender_idx ON social_invites(sender_id, created_at DESC);
CREATE INDEX social_invites_recipient_idx ON social_invites(recipient_id, status, created_at DESC);
CREATE INDEX social_invites_expiry_idx ON social_invites(expires_at) WHERE status = 'PENDING';
COMMENT ON TABLE social_invites IS 'Invitation workflow only; no API or expiration scheduler yet. Backend must expire overdue PENDING rows before offering again and reserve each participant atomically.';

ALTER TABLE conversations ADD COLUMN social_invite_id uuid UNIQUE REFERENCES social_invites(id);
ALTER TABLE conversations ADD CONSTRAINT conversations_social_origin CHECK ((mode = 'SOCIAL') = (social_invite_id IS NOT NULL));

CREATE FUNCTION guard_social_invite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM lock_user_pair(NEW.sender_id, NEW.recipient_id);
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.sender_id,NEW.recipient_id,NEW.goal_code,NEW.created_at,NEW.expires_at) IS DISTINCT FROM (OLD.sender_id,OLD.recipient_id,OLD.goal_code,OLD.created_at,OLD.expires_at)
        THEN RAISE EXCEPTION 'Invitation identity and deadline are immutable' USING ERRCODE = '23514'; END IF;
        IF OLD.status <> 'PENDING' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Resolved invitations cannot be changed' USING ERRCODE = '23514'; END IF;
    END IF;
    IF NEW.status IN ('PENDING','ACCEPTED') AND users_blocked(NEW.sender_id,NEW.recipient_id)
    THEN RAISE EXCEPTION 'Blocked users cannot exchange invitations' USING ERRCODE = '23514'; END IF;
    IF NEW.status IN ('PENDING','ACCEPTED') AND NEW.expires_at <= clock_timestamp()
    THEN RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER social_invites_guard BEFORE INSERT OR UPDATE ON social_invites FOR EACH ROW EXECUTE FUNCTION guard_social_invite();

CREATE OR REPLACE FUNCTION guard_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.user_a_id,NEW.user_b_id,NEW.mode,NEW.dating_match_id,NEW.social_invite_id) IS DISTINCT FROM (OLD.user_a_id,OLD.user_b_id,OLD.mode,OLD.dating_match_id,OLD.social_invite_id)
    THEN RAISE EXCEPTION 'Conversation participants and origin are immutable' USING ERRCODE = '23514'; END IF;
    PERFORM lock_user_pair(NEW.user_a_id, NEW.user_b_id);
    IF NEW.status IN ('CONNECTING','ACTIVE') AND users_blocked(NEW.user_a_id, NEW.user_b_id)
    THEN RAISE EXCEPTION 'Cannot open a conversation between blocked users' USING ERRCODE = '23514'; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('ENDED','FAILED') AND NEW.status <> OLD.status
    THEN RAISE EXCEPTION 'Ended conversations cannot reopen' USING ERRCODE = '23514'; END IF;
    IF NEW.mode = 'RELATIONSHIP' AND NOT EXISTS (
        SELECT FROM dating_matches WHERE id = NEW.dating_match_id AND user_a_id = NEW.user_a_id AND user_b_id = NEW.user_b_id
          AND (NEW.status IN ('ENDED','FAILED') OR status = 'ACTIVE')
    ) THEN RAISE EXCEPTION 'Conversation requires the correct active dating match' USING ERRCODE = '23514'; END IF;
    IF NEW.mode = 'SOCIAL' AND NOT EXISTS (
        SELECT FROM social_invites WHERE id = NEW.social_invite_id AND status = 'ACCEPTED'
        AND LEAST(sender_id,recipient_id) = NEW.user_a_id AND GREATEST(sender_id,recipient_id) = NEW.user_b_id
    ) THEN RAISE EXCEPTION 'Social conversation requires an accepted invitation from both participants' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION cancel_blocked_invites() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE social_invites SET status = 'CANCELLED', resolved_at = clock_timestamp()
    WHERE status = 'PENDING' AND LEAST(sender_id,recipient_id) = LEAST(NEW.blocker_id,NEW.blocked_id)
      AND GREATEST(sender_id,recipient_id) = GREATEST(NEW.blocker_id,NEW.blocked_id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER blocks_cancel_invites AFTER INSERT OR UPDATE ON blocks FOR EACH ROW EXECUTE FUNCTION cancel_blocked_invites();
