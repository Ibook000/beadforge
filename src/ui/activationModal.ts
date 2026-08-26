/**
 * 激活码兑换弹窗。
 *
 * 浮动按钮常驻（右上角）：未激活显示「🎁 激活」，已激活显示「✦ 已激活」。
 * 点击打开 modal：输入卡密 → 调 redeem() → 反馈结果。
 * 依赖 activation.ts 的单例状态 + onActivationChange 订阅。
 */

import { isActivated, onActivationChange, redeem } from '../auth/activation';

export function mountActivationUI(): void {
  // 常驻浮动按钮
  const btn = document.createElement('button');
  btn.id = 'activateBtn';
  btn.className = 'activate-float';
  btn.title = '激活码 / 去水印';
  btn.textContent = isActivated() ? '✦ 已激活' : '🎁 激活';
  document.body.appendChild(btn);

  // modal 容器（懒创建，点击才插入 DOM）
  let modal: HTMLDivElement | null = null;

  function syncLabel(): void {
    const active = isActivated();
    btn.textContent = active ? '✦ 已激活' : '🎁 激活';
    btn.classList.toggle('active', active);
  }
  onActivationChange(syncLabel);
  syncLabel();

  function close(): void {
    if (modal) {
      modal.remove();
      modal = null;
    }
  }

  function open(): void {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'activate-modal';
    const active = isActivated();
    modal.innerHTML = `
      <div class="activate-card">
        <button class="activate-close" aria-label="关闭">✕</button>
        <h3>${active ? '✦ 已激活' : '🎁 激活码兑换'}</h3>
        ${
          active
            ? '<p class="activate-note">本设备已激活，导出无水印。<br>谢谢支持 🧸</p>'
            : `<p class="activate-note">购买后输入卡密，解锁<strong>无水印导出</strong>（PNG / PDF / CSV）。<br>一张卡密绑定一台设备。</p>
               <input class="activate-input" type="text" placeholder="粘贴卡密（如 ABCD-EFGH-…）" autocomplete="off" spellcheck="false">
               <div class="activate-msg" role="status"></div>
               <button class="activate-submit">兑换激活</button>`
        }
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    modal.querySelector('.activate-close')?.addEventListener('click', close);
    document.body.appendChild(modal);

    if (!active) {
      const input = modal.querySelector<HTMLInputElement>('.activate-input')!;
      const msg = modal.querySelector<HTMLElement>('.activate-msg')!;
      const submit = modal.querySelector<HTMLButtonElement>('.activate-submit')!;

      const doRedeem = async (): Promise<void> => {
        const code = input.value.trim();
        if (!code) {
          msg.textContent = '请先输入卡密';
          msg.className = 'activate-msg error';
          return;
        }
        submit.disabled = true;
        submit.textContent = '验证中…';
        const { ok, message } = await redeem(code);
        msg.textContent = message;
        msg.className = ok ? 'activate-msg ok' : 'activate-msg error';
        if (ok) {
          submit.textContent = '✓ 已激活';
          setTimeout(close, 1200);
        } else {
          submit.disabled = false;
          submit.textContent = '兑换激活';
        }
      };

      submit.addEventListener('click', () => void doRedeem());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void doRedeem();
      });
      input.focus();
    }
  }

  btn.addEventListener('click', open);
}
