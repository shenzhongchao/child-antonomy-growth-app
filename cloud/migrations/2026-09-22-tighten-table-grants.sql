-- 收紧表权限：把平台建表时默认授予 anon / authenticated 的宽权限收回，
-- 落实「事件账本只增不改」的设计（AGENTS.md：普通用户对事件表只有 SELECT, INSERT）。
-- 可重复执行；不改表结构、不删数据、不动 RLS 策略。
--
-- 背景：GRANT 只能加权限、不能减权限。平台建表时默认给 authenticated 的是
-- `arwdDxtm`（全权限，含 UPDATE / DELETE / TRUNCATE），所以 schema 里写的
-- `GRANT SELECT, INSERT ON growth_events TO authenticated` 只是「至少给这些」，
-- 并不会把多余权限收回去，必须显式 REVOKE。
--
-- 为什么必须收 TRUNCATE：RLS 只作用于 SELECT / INSERT / UPDATE / DELETE，
-- **不拦 TRUNCATE**。留着 TRUNCATE 等于留了一个绕过行级约束清空整表的口子。
--
-- 于 2026-09-22 对 itonghao-d5gv3zqpl9f36e109 环境执行过，执行后 ACL 为：
--   growth_events -> authenticated=ar
--   profiles      -> authenticated=arw

BEGIN;

-- 事件表：登录用户只能读取和追加，不能改也不能删
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.growth_events FROM authenticated, anon;
GRANT SELECT, INSERT ON public.growth_events TO authenticated;

-- 档案表：登录用户可读取、新建、更新元数据，不允许删除
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.profiles FROM authenticated, anon;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

COMMIT;
