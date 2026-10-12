-- Trigger records have different fields on dating_likes and dating_matches.
-- A boolean AND does not prevent PostgreSQL resolving nonexistent record fields.
CREATE OR REPLACE FUNCTION guard_dating_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid; b uuid;
BEGIN
    IF TG_TABLE_NAME = 'dating_likes' THEN
        a := NEW.sender_id;
        b := NEW.recipient_id;
    ELSE
        a := NEW.user_a_id;
        b := NEW.user_b_id;
    END IF;
    PERFORM lock_user_pair(a, b);
    IF TG_TABLE_NAME = 'dating_matches' THEN
        IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
    END IF;
    IF users_blocked(a, b) THEN
        RAISE EXCEPTION 'Blocked users cannot like or match' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'dating_matches' THEN
        IF NOT EXISTS (SELECT FROM dating_likes WHERE sender_id = a AND recipient_id = b)
           OR NOT EXISTS (SELECT FROM dating_likes WHERE sender_id = b AND recipient_id = a) THEN
            RAISE EXCEPTION 'An active dating match requires mutual likes' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
