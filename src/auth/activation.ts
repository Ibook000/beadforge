/**
 * 激活码系统 —— 前端侧。
 *
 * 只做三件事：
 *   1. 用 publishable key 初始化 Supabase 客户端（anon key 设计为公开，可放前端）。
 *   2. 调用数据库端 RPC `redeem_key(code, deviceId)` 兑换卡密 —— 判断逻辑在数据库，
 *      前端拿不到卡密表，也学不到怎么绕过。
 *   3. 用 localStorage 缓存「本设备已激活」状态，供导出层判断是否画水印。
 *
 * 离线语义：验证是"尽力而为"——有缓存直接放行；缓存过期会后台刷新一次；
 * 网络失败不阻塞导出（不把用户锁在门外），只是下次联网时状态会回落为未激活。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// localStorage 键名
const LS_KEY = 'picabead:activation:v1';
const LS_DEVICE = 'picabead:deviceId:v1';

export interface ActivationState {
  /** 是否已激活（导出时据此决定水印） */
  active: boolean;
  /** 上次成功验证的卡密（仅用于回显，不用于判断） */
  code: string | null;
  /** 验证时间戳，用于缓存刷新 */
  verifiedAt: number;
}

interface RedeemResult {
  ok: boolean;
  status: string;
  message: string;
}

type Listener = (active: boolean) => void;

// ---- 运行时状态（单例）----
let cached: ActivationState | null = null;
let client: SupabaseClient | null = null;
const listeners = new Set<Listener>();

function loadCached(): ActivationState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivationState;
    if (typeof parsed.active !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(state: ActivationState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式等无法写入时静默忽略 */
  }
}

function emit(): void {
  const active = cached?.active ?? false;
  for (const l of listeners) l(active);
}

/** 订阅激活状态变化，返回退订函数 */
export function onActivationChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 当前是否已激活（同步，读缓存） */
export function isActivated(): boolean {
  return cached?.active ?? false;
}

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) return null;
  client = createClient(url, anon);
  return client;
}

/**
 * 设备指纹：尽量稳定。优先 crypto.randomUUID（现代浏览器），
 * 退化用 Math.random 拼接。持久化在 localStorage。
 */
function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(LS_DEVICE);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(LS_DEVICE, id);
    return id;
  } catch {
    return `dev-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * 兑换卡密。成功后写缓存、广播状态。
 * @param code 用户输入的卡密
 * @returns {ok, message} 供 UI 提示
 */
export async function redeem(code: string): Promise<{ ok: boolean; message: string }> {
  const c = getClient();
  if (!c) {
    return { ok: false, message: '站点未配置激活服务，请联系作者' };
  }
  const deviceId = getDeviceId();

  try {
    const { data, error } = await c.rpc('redeem_key', {
      p_code: code.trim(),
      p_device: deviceId,
    });
    if (error) {
      return { ok: false, message: `激活失败：${error.message}` };
    }
    const res = data as RedeemResult;
    if (res.ok) {
      cached = { active: true, code: code.trim(), verifiedAt: Date.now() };
      persist(cached);
      emit();
    }
    return { ok: res.ok, message: res.message };
  } catch (e) {
    return { ok: false, message: `网络错误：${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * 导出前调用：确保激活状态新鲜。
 * - 已激活（缓存）→ 直接放行（不联网，离线可用）
 * - 未激活但有缓存码 → 后台验证一次（尽力而为，失败不阻塞导出）
 *
 * @returns true = 未激活，导出需要带水印
 */
export async function shouldDrawWatermark(): Promise<boolean> {
  if (isActivated()) return false;

  const c = getClient();
  // 没有缓存码就无从验证，直接判定未激活（避免无谓的 RPC 请求）
  if (c && cached?.code) {
    const deviceId = getDeviceId();
    try {
      const { data, error } = await c.rpc('redeem_key', {
        p_code: cached.code,
        p_device: deviceId,
      });
      // 服务器确认有效 → 视为激活；否则保持未激活
      if (!error && (data as RedeemResult)?.ok) {
        cached = { active: true, code: cached.code, verifiedAt: Date.now() };
        persist(cached);
        emit();
        return false;
      }
    } catch {
      /* 离线：保持当前状态，不阻塞导出 */
    }
  }
  return true;
}

/** 启动时恢复缓存状态（main.ts 调用） */
export function initActivation(): void {
  cached = loadCached();
  emit();
}
