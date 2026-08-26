/**
 * 生成一批激活卡密并插入 Supabase。
 *
 * 用法（二选一）：
 *   1. 本机有 SUPABASE_SECRET_KEY 环境变量：直接跑
 *   2. 无密钥：node scripts/gen-codes.mjs 10  → 只打印 10 个候选卡密，
 *      你拿着去 Supabase SQL Editor 手动插入（第 3 段 SQL 的逻辑）
 *
 * 默认生成 10 个，可传参：node scripts/gen-codes.mjs 25
 *
 * 注意：secret key 绝不能打进前端，这里只用于本地/管理员批量发码。
 * 用 @supabase/supabase-js 的 service role key（表权限）插入 activation_keys。
 */

const args = process.argv.slice(2);
const count = Number(args.find((a) => /^\d+$/.test(a)) || 10);
const quiet = args.includes('--quiet');

// 24 位高熵大写字母数字（与 schema.sql 的 random_code 一致）
function randomCode(len = 24) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

const secret = process.env.SUPABASE_SECRET_KEY;
const url = process.env.SUPABASE_URL;

if (!url) {
  console.error('缺少 SUPABASE_URL 环境变量');
  process.exit(1);
}

if (!secret) {
  // 无密钥模式：只打印候选码，用户自行去 SQL Editor 插入
  console.log('未设置 SUPABASE_SECRET_KEY —— 打印候选卡密，请到 SQL Editor 执行：');
  console.log('insert into public.activation_keys (code, plan) values');
  const rows = [];
  for (let i = 0; i < count; i++) {
    const code = randomCode();
    rows.push(`  ('${code}', 'pro')`);
  }
  console.log(rows.join(',\n') + ';');
  process.exit(0);
}

// 有密钥模式：直接插入
const { createClient } = await import('@supabase/supabase-js');
const c = createClient(url, secret);

const codes = [];
for (let i = 0; i < count; i++) codes.push(randomCode());

const { error } = await c
  .from('activation_keys')
  .insert(codes.map((code) => ({ code, plan: 'pro' })));

if (error) {
  console.error('插入失败：', error.message);
  process.exit(1);
}
if (quiet) {
  // 静默模式：只报数量，不回显卡密（防止卡密出现在聊天/日志里）
  console.log(`✅ 已生成 ${count} 个卡密（plan=pro，--quiet 不回显）。可在 Supabase 控制台 activation_keys 表查看。`);
} else {
  codes.forEach((code, i) => console.log(`  ${i + 1}. ${code}`));
}
