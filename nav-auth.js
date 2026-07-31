(function () {
  if (!document.getElementById('nav-signin')) return;

  let dropdownOpen = false;

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }

  function initialsAvatar(name, size) {
    const initial = getInitials(name);
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'%3E%3Crect width='${size}' height='${size}' rx='${size / 2}' fill='%233B4A34'/%3E%3Ctext x='${size / 2}' y='${size / 2 + size * 0.14}' text-anchor='middle' font-size='${size * 0.42}' font-weight='600' fill='white' font-family='Inter,sans-serif'%3E${initial}%3C/text%3E%3C/svg%3E`;
  }

  function buildDropdown(user) {
    const dropdown = document.createElement('div');
    dropdown.className = 'nav-dropdown';

    const email = user.email || '';
    const name = user.user_metadata?.full_name || email.split('@')[0] || 'User';

    dropdown.innerHTML = `
      <div class="nav-dropdown-header">
        <span class="nav-dropdown-name">${name}</span>
        <span class="nav-dropdown-email">${email}</span>
      </div>
      <div class="nav-dropdown-divider"></div>
      <a class="nav-dropdown-item" href="profile.html">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        My Profile
      </a>
      <a class="nav-dropdown-item" href="booking.html">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        My Bookings
      </a>
      <a class="nav-dropdown-item" href="settings.html">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Settings
      </a>
      <div class="nav-dropdown-divider"></div>
      <button class="nav-dropdown-item nav-dropdown-signout" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign Out
      </button>
    `;

    dropdown.querySelector('.nav-dropdown-signout').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      closeDropdown();
    });

    return dropdown;
  }

  let dropdownEl = null;

  function closeDropdown() {
    if (dropdownEl) {
      dropdownEl.classList.remove('nav-dropdown--open');
      setTimeout(() => { if (dropdownEl && dropdownEl.parentNode) dropdownEl.parentNode.removeChild(dropdownEl); dropdownEl = null; }, 200);
    }
    dropdownOpen = false;
  }

  function openDropdown(avatar, user) {
    if (dropdownEl) closeDropdown();
    dropdownEl = buildDropdown(user);
    avatar.parentNode.appendChild(dropdownEl);
    requestAnimationFrame(() => dropdownEl.classList.add('nav-dropdown--open'));
    dropdownOpen = true;
  }

  function toggleDropdown(avatar, user) {
    if (dropdownOpen) { closeDropdown(); } else { openDropdown(avatar, user); }
  }

  function updateNav(user) {
    const existing = document.querySelector('.nav-auth-wrap');
    if (existing) { existing.parentNode.removeChild(existing); }
    closeDropdown();

    const navSignin = document.getElementById('nav-signin');

    if (user) {
      navSignin.style.display = 'none';

      const email = user.email || '';
      const name = user.user_metadata?.full_name || email.split('@')[0] || 'User';
      const avatarUrl = user.user_metadata?.avatar_url;

      const wrap = document.createElement('div');
      wrap.className = 'nav-auth-wrap';

      const avatar = document.createElement('button');
      avatar.className = 'nav-avatar';
      avatar.type = 'button';
      avatar.setAttribute('aria-label', 'User menu');

      if (avatarUrl) {
        avatar.style.backgroundImage = `url(${avatarUrl})`;
      } else {
        avatar.style.backgroundImage = `url(${initialsAvatar(name, 40)})`;
      }

      const statusDot = document.createElement('span');
      statusDot.className = 'nav-status-dot';
      avatar.appendChild(statusDot);

      avatar.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(avatar, user); });

      wrap.appendChild(avatar);
      navSignin.parentNode.insertBefore(wrap, navSignin.nextSibling);
    } else {
      navSignin.style.display = '';
    }
  }

  document.addEventListener('click', (e) => {
    if (dropdownOpen && !e.target.closest('.nav-auth-wrap')) {
      closeDropdown();
    }
  });

  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    updateNav(session?.user || null);
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
      updateNav(session?.user || null);
    }
  });
})();
