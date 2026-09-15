-- 今天我做主：安全加固后的全新环境建表脚本。
-- ⚠️ 破坏性脚本：会 DROP profiles / growth_events。只允许在“全新空环境”第一次执行。
-- 已有任何真实数据时禁止执行；已有 V2 环境请改跑 migrations/2026-09-15-security-hardening.sql。

BEGIN;

DROP TABLE IF EXISTS public.growth_events;
DROP TABLE IF EXISTS public.profiles;

CREATE TABLE public.profiles (
  id         text PRIMARY KEY,
  user_id    text NOT NULL UNIQUE,
  name       text NOT NULL DEFAULT '小小探险家',
  phone      text,
  updated_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.growth_events (
  server_seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id         text PRIMARY KEY,
  user_id    text NOT NULL,
  profile_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id  text NOT NULL,
  type       text NOT NULL,
  day        text,
  t          bigint NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX growth_events_profile_seq_idx ON public.growth_events (profile_id, server_seq);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.growth_events TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON public.profiles, public.growth_events TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_own ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY growth_events_read ON public.growth_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY growth_events_append ON public.growth_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id AND p.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.validate_growth_event_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  st jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.profile_id));

  IF char_length(NEW.id) < 1 OR char_length(NEW.id) > 200 THEN RAISE EXCEPTION 'invalid event id'; END IF;
  IF char_length(NEW.user_id) < 1 OR char_length(NEW.user_id) > 160 THEN RAISE EXCEPTION 'invalid user id'; END IF;
  IF char_length(NEW.profile_id) < 1 OR char_length(NEW.profile_id) > 200 THEN RAISE EXCEPTION 'invalid profile id'; END IF;
  IF char_length(NEW.device_id) < 1 OR char_length(NEW.device_id) > 160 THEN RAISE EXCEPTION 'invalid device id'; END IF;
  IF NEW.t < 0 THEN RAISE EXCEPTION 'invalid event time'; END IF;

  IF NEW.type NOT IN (
    'state.import','task.done','pick','plan','mood','note',
    'reward.redeem','reward.use','skill.graduate',
    'settings.name','settings.goal','settings.prices'
  ) THEN RAISE EXCEPTION 'event type not allowed'; END IF;

  IF NEW.day IS NOT NULL THEN
    IF NEW.day !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid day'; END IF;
    BEGIN
      IF to_char(NEW.day::date, 'YYYY-MM-DD') <> NEW.day THEN RAISE EXCEPTION 'invalid day'; END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid day';
    END;
  END IF;

  IF NEW.type = 'state.import' THEN
    IF octet_length(NEW.payload::text) > 524288 THEN RAISE EXCEPTION 'import payload too large'; END IF;
    IF EXISTS (SELECT 1 FROM public.growth_events e WHERE e.profile_id = NEW.profile_id) THEN
      RAISE EXCEPTION 'state.import is only allowed as the first profile event';
    END IF;
    st := NEW.payload->'payload';
    IF jsonb_typeof(st) <> 'object'
       OR jsonb_typeof(st->'days') <> 'object'
       OR jsonb_typeof(st->'stars') <> 'number'
       OR COALESCE(st->>'stars','') !~ '^\d{1,7}$'
       OR (st->>'stars')::integer > 1000000
       OR jsonb_typeof(st->'counts') <> 'array'
       OR jsonb_array_length(st->'counts') <> 6
       OR jsonb_typeof(st->'rewards') <> 'array'
       OR jsonb_typeof(st->'name') <> 'string'
       OR char_length(st->>'name') NOT BETWEEN 1 AND 12
       OR COALESCE(st->>'goal','') NOT IN ('3','5','7')
       OR jsonb_typeof(st->'graduated') <> 'array'
       OR jsonb_typeof(st->'prices') <> 'array'
       OR jsonb_array_length(st->'prices') <> 6 THEN
      RAISE EXCEPTION 'invalid import state';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(st->'counts') LOOP
      IF jsonb_typeof(item) <> 'number' OR item::text !~ '^\d{1,7}$' OR (item::text)::integer > 1000000 THEN RAISE EXCEPTION 'invalid import counts'; END IF;
    END LOOP;
    FOR item IN SELECT value FROM jsonb_array_elements(st->'prices') LOOP
      IF jsonb_typeof(item) <> 'number' OR item::text !~ '^\d{1,2}$' OR (item::text)::integer NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'invalid import prices'; END IF;
    END LOOP;
    FOR item IN SELECT value FROM jsonb_array_elements(st->'rewards') LOOP
      IF jsonb_typeof(item) <> 'object'
         OR COALESCE(item->>'id','') !~ '^[0-5]$'
         OR COALESCE(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
         OR char_length(COALESCE(item->>'eventId','')) > 200 THEN RAISE EXCEPTION 'invalid import reward'; END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  IF octet_length(NEW.payload::text) > 8192 THEN RAISE EXCEPTION 'event payload too large'; END IF;

  CASE NEW.type
    WHEN 'task.done' THEN
      IF NEW.day IS NULL OR COALESCE(NEW.payload->>'task','') !~ '^[0-5]$' OR COALESCE(NEW.payload->>'mode','') NOT IN ('self','help') THEN RAISE EXCEPTION 'invalid task.done'; END IF;
    WHEN 'pick' THEN
      IF NEW.day IS NULL OR jsonb_typeof(NEW.payload->'selected') <> 'array' OR jsonb_array_length(NEW.payload->'selected') > 3 THEN RAISE EXCEPTION 'invalid pick'; END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'selected') LOOP
        IF jsonb_typeof(item) <> 'number' OR item::text !~ '^[0-5]$' THEN RAISE EXCEPTION 'invalid pick task'; END IF;
      END LOOP;
    WHEN 'plan' THEN
      IF NEW.day IS NULL OR jsonb_typeof(NEW.payload->'plan') <> 'array' OR jsonb_array_length(NEW.payload->'plan') NOT BETWEEN 1 AND 10 OR jsonb_typeof(NEW.payload->'planned') <> 'boolean' THEN RAISE EXCEPTION 'invalid plan'; END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'plan') LOOP
        IF jsonb_typeof(item) <> 'string' OR char_length(item #>> '{}') NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'invalid plan item'; END IF;
      END LOOP;
    WHEN 'mood' THEN
      IF NEW.day IS NULL OR COALESCE(NEW.payload->>'mood','') !~ '^[0-4]$' THEN RAISE EXCEPTION 'invalid mood'; END IF;
    WHEN 'note' THEN
      IF NEW.day IS NULL OR jsonb_typeof(NEW.payload->'text') <> 'string' OR char_length(NEW.payload->>'text') > 80 THEN RAISE EXCEPTION 'invalid note'; END IF;
    WHEN 'reward.redeem' THEN
      IF NEW.day IS NULL OR COALESCE(NEW.payload->>'reward','') !~ '^[0-5]$' OR COALESCE(NEW.payload->>'cost','') !~ '^\d{1,2}$' OR (NEW.payload->>'cost')::integer NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'invalid reward.redeem'; END IF;
    WHEN 'reward.use' THEN
      IF jsonb_typeof(NEW.payload->'rewardId') <> 'string' OR char_length(NEW.payload->>'rewardId') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid reward.use'; END IF;
    WHEN 'skill.graduate' THEN
      IF COALESCE(NEW.payload->>'task','') !~ '^[0-5]$' OR jsonb_typeof(NEW.payload->'on') <> 'boolean' THEN RAISE EXCEPTION 'invalid skill.graduate'; END IF;
    WHEN 'settings.name' THEN
      IF jsonb_typeof(NEW.payload->'value') <> 'string' OR char_length(NEW.payload->>'value') NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'invalid settings.name'; END IF;
    WHEN 'settings.goal' THEN
      IF COALESCE(NEW.payload->>'value','') NOT IN ('3','5','7') THEN RAISE EXCEPTION 'invalid settings.goal'; END IF;
    WHEN 'settings.prices' THEN
      IF jsonb_typeof(NEW.payload->'value') <> 'array' OR jsonb_array_length(NEW.payload->'value') <> 6 THEN RAISE EXCEPTION 'invalid settings.prices'; END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'value') LOOP
        IF jsonb_typeof(item) <> 'number' OR item::text !~ '^\d{1,2}$' OR (item::text)::integer NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'invalid price'; END IF;
      END LOOP;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER growth_events_validate_v1
BEFORE INSERT ON public.growth_events
FOR EACH ROW EXECUTE FUNCTION public.validate_growth_event_v1();

COMMIT;
