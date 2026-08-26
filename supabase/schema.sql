-- ============================================================================
-- Picabead 激活码系统 · Supabase Schema
-- 在 Supabase 控制台 → SQL Editor 粘贴本文件执行（一次即可）。
-- 三段：1) 卡密表  2) 兑换/验证函数（SECURITY DEFINER）  3) 生成卡密 SQL（管理员用）
-- 安全模型：前端只能用 anon/publishable key 调 redeem_key() RPC，
--           卡密表对客户端完全不可读（RLS 全禁），判断逻辑藏在数据库端。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) 激活码表
-- ---------------------------------------------------------------------------
create table if not exists public.activation_keys (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,            -- 卡密（大写字母数字，禁 SELECT 泄露）
  plan          text not null default 'pro',     -- 套餐：pro / lifetime 等（预留）
  redeemed      boolean not null default false,  -- 是否已兑
  redeemed_at   timestamptz,
  device_id     text,                            -- 绑定的设备指纹
  created_at    timestamptz not null default now()
);

-- 客户端完全不可读：任何 anon/authenticated 都 SELECT/UPDATE 不了
alter table public.activation_keys enable row level security;

-- 卡密对客户端零权限（连 SELECT 都没有）。只有下面的 SECURITY DEFINER 函数能碰。
drop policy if exists "activation_keys_no_select" on public.activation_keys;
create policy "activation_keys_no_select" on public.activation_keys
  for select to anon, authenticated using (false);

-- ---------------------------------------------------------------------------
-- 2) 兑换函数（前端唯一入口）
--    入参：卡密 + 设备指纹；返回 json（{ ok, status, message }）
--    规则：未用过 → 兑换成功并绑定设备
--          同设备重复兑 → ok（幂等，友好提示）
--          已兑且是别的设备 → 拒绝（一卡一设备）
-- ---------------------------------------------------------------------------
create or replace function public.redeem_key(p_code text, p_device text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.activation_keys%rowtype;
begin
  -- 输入兜底
  if p_code is null or btrim(p_code) = '' or p_device is null or btrim(p_device) = '' then
    return json_build_object('ok', false, 'status', 'bad_input', 'message', '卡密或设备信息不完整');
  end if;

  select * into v_row from public.activation_keys
    where code = upper(btrim(p_code));

  if not found then
    return json_build_object('ok', false, 'status', 'not_found', 'message', '卡密不存在，请检查输入');
  end if;

  if v_row.redeemed then
    if v_row.device_id = p_device then
      -- 同一设备重复兑换：视为已激活，幂等返回成功
      return json_build_object('ok', true, 'status', 'already', 'message', '该设备已激活');
    else
      -- 已绑定别的设备：拒绝
      return json_build_object('ok', false, 'status', 'used_elsewhere', 'message', '该卡密已在其他设备使用');
    end if;
  end if;

  -- 首次兑换：标记 + 绑定设备
  update public.activation_keys
     set redeemed = true, redeemed_at = now(), device_id = p_device
   where id = v_row.id;

  return json_build_object('ok', true, 'status', 'ok', 'message', '激活成功');
end;
$$;

-- 只允许 anon/authenticated 调用这个函数，且仅此函数
revoke all on function public.redeem_key(text, text) from public;
grant execute on function public.redeem_key(text, text) to anon, authenticated;

-- 确认：卡密表本身对 anon 无任何权限（重要：检查后不要放开）
revoke all on table public.activation_keys from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) 生成卡密（管理员用）
--    这段用 service role（secret key）在控制台执行。
--    生成一批随机卡密：random_code() 生成 24 位大写字母数字（高熵，防穷举）。
--    前端永远不需要也不应该拿到这段。
-- ---------------------------------------------------------------------------
create or replace function public.random_code(len int default 24)
returns text
language sql
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, len))
$$;

-- 一次性生成 10 个卡密（数字可改）：
-- insert into public.activation_keys (code, plan)
-- select public.random_code(24), 'pro' from generate_series(1, 10);

-- 查看已生成卡密（只有你能看，普通用户摸不到这张表）：
-- select code, plan, redeemed, redeemed_at from public.activation_keys;
