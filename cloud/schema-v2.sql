-- 今天我做主：账号与成长事件 V2（全新环境，无历史兼容）
-- 在 CloudBase PostgreSQL 控制台 SQL 编辑器中一次执行。

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

CREATE INDEX growth_events_profile_seq_idx
  ON public.growth_events (profile_id, server_seq);

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

COMMIT;
