/**
 * Admin mode with login dialog.
 * Credentials: username & password both "mike".
 * Adds a floating lock button on every page to toggle admin mode.
 */
(() => {
  const ADMIN_USER = 'mike';
  const ADMIN_PASS = 'mike';

  let isAdmin = false;
  try { isAdmin = localStorage.getItem('_admin_mode') === 'true'; } catch {}

  // Auto-login via URL param (legacy support)
  const urlToken = new URLSearchParams(window.location.search).get('admin');
  if (urlToken) {
    try {
      localStorage.setItem('_admin_mode', 'true');
      localStorage.setItem('_sync_secret', urlToken);
      isAdmin = true;
    } catch {}
  }

  if (isAdmin) {
    document.documentElement.classList.add('is-admin');
  }

  document.addEventListener('DOMContentLoaded', () => {
    // ── Floating toggle button (always visible) ──
    const toggle = document.createElement('button');
    toggle.id = 'admin-toggle';
    toggle.setAttribute('aria-label', '管理員模式');
    toggle.textContent = isAdmin ? '🔓' : '🔒';
    document.body.appendChild(toggle);

    // ── Admin badge (only when logged in) ──
    let badge = null;
    if (isAdmin) {
      badge = document.createElement('div');
      badge.className = 'admin-badge';
      badge.textContent = '🔧 Admin Mode';
      document.body.appendChild(badge);
    }

    // ── Login dialog ──
    const overlay = document.createElement('div');
    overlay.id = 'admin-login-overlay';
    overlay.innerHTML = `
      <div class="admin-login-box">
        <h3>管理員登入</h3>
        <input type="text" id="admin-user" placeholder="帳號" autocomplete="username">
        <input type="password" id="admin-pass" placeholder="密碼" autocomplete="current-password">
        <div class="admin-login-actions">
          <button id="admin-login-btn" type="button">登入</button>
          <button id="admin-cancel-btn" type="button">取消</button>
        </div>
        <div id="admin-login-error"></div>
      </div>`;
    document.body.appendChild(overlay);

    const userInput = document.getElementById('admin-user');
    const passInput = document.getElementById('admin-pass');
    const errorEl = document.getElementById('admin-login-error');

    function openLogin() {
      overlay.classList.add('open');
      userInput.value = '';
      passInput.value = '';
      errorEl.textContent = '';
      setTimeout(() => userInput.focus(), 60);
    }

    function closeLogin() {
      overlay.classList.remove('open');
    }

    function doLogin() {
      const u = userInput.value.trim();
      const p = passInput.value.trim();
      if (u === ADMIN_USER && p === ADMIN_PASS) {
        try {
          localStorage.setItem('_admin_mode', 'true');
          if (!localStorage.getItem('_sync_secret')) {
            localStorage.setItem('_sync_secret', u);
          }
        } catch {}
        isAdmin = true;
        document.documentElement.classList.add('is-admin');
        toggle.textContent = '🔓';
        closeLogin();
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'admin-badge';
          badge.textContent = '🔧 Admin Mode';
          document.body.appendChild(badge);
        }
      } else {
        errorEl.textContent = '帳號或密碼錯誤';
        passInput.value = '';
        passInput.focus();
      }
    }

    function doLogout() {
      try {
        localStorage.removeItem('_admin_mode');
        localStorage.removeItem('_admin_token');
      } catch {}
      isAdmin = false;
      document.documentElement.classList.remove('is-admin');
      toggle.textContent = '🔒';
      if (badge) { badge.remove(); badge = null; }
    }

    toggle.addEventListener('click', () => {
      if (isAdmin) {
        doLogout();
      } else {
        openLogin();
      }
    });

    document.getElementById('admin-login-btn').addEventListener('click', doLogin);
    document.getElementById('admin-cancel-btn').addEventListener('click', closeLogin);
    passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passInput.focus(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLogin(); });
  });

  window._isAdmin = () => isAdmin;
  window._exitAdmin = () => {
    try {
      localStorage.removeItem('_admin_mode');
      localStorage.removeItem('_admin_token');
    } catch {}
    document.documentElement.classList.remove('is-admin');
    document.querySelector('.admin-badge')?.remove();
    const t = document.getElementById('admin-toggle');
    if (t) t.textContent = '🔒';
  };
})();
