/**
 * Admin mode: hides .admin-only elements from visitors.
 *
 * Activation:
 *   1. URL param: ?admin=<token>  → saves to localStorage, adds body.is-admin
 *   2. localStorage '_admin_mode' === 'true'
 *
 * Usage: add class="admin-only" to any element that should be hidden from visitors.
 * Admin users see a small floating badge indicating admin mode is active.
 */
(() => {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('admin');

  if (urlToken) {
    try {
      localStorage.setItem('_admin_mode', 'true');
      localStorage.setItem('_admin_token', urlToken);
      // Also save sync secret if not already set
      if (!localStorage.getItem('_sync_secret')) {
        localStorage.setItem('_sync_secret', urlToken);
      }
    } catch {}
  }

  let isAdmin = false;
  try {
    isAdmin = localStorage.getItem('_admin_mode') === 'true';
  } catch {}

  if (isAdmin) {
    document.documentElement.classList.add('is-admin');

    // Add floating admin badge
    document.addEventListener('DOMContentLoaded', () => {
      const badge = document.createElement('div');
      badge.className = 'admin-badge';
      badge.innerHTML = '🔧 Admin <button onclick="window._exitAdmin()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:.7rem;margin-left:4px;">✕</button>';
      document.body.appendChild(badge);
    });
  }

  window._exitAdmin = () => {
    try {
      localStorage.removeItem('_admin_mode');
      localStorage.removeItem('_admin_token');
    } catch {}
    document.documentElement.classList.remove('is-admin');
    document.querySelector('.admin-badge')?.remove();
  };

  window._isAdmin = () => isAdmin;
})();
