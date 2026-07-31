// ============================================================================
// Auth flow — email/password + Google OAuth.
//
// EMAIL CONFIRMATION SETTING (Supabase Dashboard → Authentication → Providers → Email):
// - "Confirm email" is ON by default, so new sign-ups must click the link in the
//   confirmation email before they can sign in.
// - FOR LOCAL DEV/DEMO ONLY: you may turn "Confirm email" OFF so new sign-ups can
//   log in immediately. This also unblocks previously-unconfirmed accounts.
//   ⚠️ MUST be re-enabled before production launch.
// - The login form below shows a "Resend confirmation email" button whenever
//   Supabase returns the "Email not confirmed" error, so users are never stuck.
//
// REDIRECT SETTINGS (Dashboard → Authentication → URL Configuration):
// - Site URL and Redirect URLs must include http://127.0.0.1:8000 (local dev)
//   and your deployed domain, or confirmation links land on a blank page.
// - Email Templates → "Confirm signup" must keep {{ .ConfirmationURL }}.
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');
  const signedinView = document.getElementById('signedin-view');
  const showSignup = document.getElementById('show-signup');
  const showSignin = document.getElementById('show-signin');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const signoutBtn = document.getElementById('signout-btn');
  const signedinEmail = document.getElementById('signedin-email');
  const authMessage = document.getElementById('auth-message');
  const resendBtn = document.getElementById('resend-confirm');
  let lastLoginEmail = '';

  function showError(form, msg) {
    const el = form === 'login' ? document.getElementById('login-error') : document.getElementById('register-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function friendlyAuthError(error) {
    const raw = (error && error.message) || '';
    if (raw === 'Failed to fetch' || /network|failed to fetch/i.test(raw)) {
      return 'Could not reach the login service. A privacy blocker (Edge Tracking Prevention, ad-blocker) may be stopping the request — try an InPrivate window, or allow supabase.co in your browser settings.';
    }
    if (error && (error.code === 'invalid_credentials' || /invalid login credentials/i.test(raw))) {
      return 'Invalid email or password.';
    }
    if (error && (error.code === 'email_not_confirmed' || /email not confirmed/i.test(raw))) {
      return 'Please confirm your email first. Check your inbox for the confirmation link.';
    }
    return raw || 'Something went wrong. Please try again.';
  }

  function isEmailNotConfirmed(error) {
    const raw = (error && error.message) || '';
    return !!(error && (error.code === 'email_not_confirmed' || /email not confirmed/i.test(raw)));
  }

  function clearErrors() {
    ['login-error', 'register-error'].forEach(id => {
      const el = document.getElementById(id);
      el.style.display = 'none';
      el.textContent = '';
    });
  }

  function showMessage(msg, type) {
    authMessage.textContent = msg;
    authMessage.style.display = 'block';
    authMessage.style.color = type === 'error' ? '#c0392b' : '#3B4A34';
    authMessage.style.background = type === 'error' ? 'rgba(192,57,43,0.08)' : 'rgba(59,74,52,0.08)';
    authMessage.style.padding = '0.9rem 1rem';
    authMessage.style.borderRadius = '12px';
    authMessage.style.marginBottom = '1.5rem';
    authMessage.style.fontSize = '0.95rem';
  }

  function toggleView(view) {
    signinForm.style.display = view === 'signin' ? 'block' : 'none';
    signupForm.style.display = view === 'signup' ? 'block' : 'none';
    signedinView.style.display = 'none';
    clearErrors();
  }

  if (showSignup) showSignup.addEventListener('click', (e) => { e.preventDefault(); toggleView('signup'); });
  if (showSignin) showSignin.addEventListener('click', (e) => { e.preventDefault(); toggleView('signin'); });

  async function signInWithGoogle() {
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
      if (error) {
        console.error('Google sign-in error:', error);
        showMessage(friendlyAuthError(error), 'error');
      }
    } catch (err) {
      console.error('Google sign-in threw:', err);
      showMessage(friendlyAuthError(err), 'error');
    }
  }

  const googleSigninBtn = document.getElementById('google-signin-btn');
  const googleSignupBtn = document.getElementById('google-signup-btn');
  if (googleSigninBtn) googleSigninBtn.addEventListener('click', signInWithGoogle);
  if (googleSignupBtn) googleSignupBtn.addEventListener('click', signInWithGoogle);

  async function checkSession() {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (session) {
        signinForm.style.display = 'none';
        signupForm.style.display = 'none';
        signedinView.style.display = 'block';
        const name = session.user.user_metadata?.full_name || session.user.email;
        const avatar = session.user.user_metadata?.avatar_url;
        signedinEmail.innerHTML = avatar
          ? `<img src="${avatar}" style="width:48px;height:48px;border-radius:50%;margin-bottom:0.5rem;" /><br />Signed in as <strong>${name}</strong>`
          : `Signed in as <strong>${name}</strong>`;
      }
    } catch (err) {
      console.warn('Session check skipped:', err);
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      if (resendBtn) resendBtn.style.display = 'none';
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        lastLoginEmail = email;

        if (error) {
          console.error('Sign-in error:', error);
          if (isEmailNotConfirmed(error)) {
            const errBox = document.getElementById('login-error');
            errBox.textContent = 'Please confirm your email first. Check your inbox for the confirmation link, or resend it below.';
            errBox.style.display = 'block';
            if (resendBtn) resendBtn.style.display = 'block';
          } else {
            if (resendBtn) resendBtn.style.display = 'none';
            showError('login', friendlyAuthError(error));
          }
        } else {
          showMessage('Signed in successfully!', 'success');
          setTimeout(() => {
            signinForm.style.display = 'none';
            signupForm.style.display = 'none';
            signedinView.style.display = 'block';
            signedinEmail.textContent = `Signed in as ${data.user.email}`;
            authMessage.style.display = 'none';
          }, 800);
        }
      } catch (err) {
        console.error('Sign-in threw:', err);
        showError('login', friendlyAuthError(err));
      }
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      const email = lastLoginEmail || document.getElementById('login-email').value;
      if (!email) return;
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending…';
      try {
        const { error } = await supabaseClient.auth.resend({ type: 'signup', email });
        if (error) {
          console.error('Resend confirmation error:', error);
          showMessage(friendlyAuthError(error), 'error');
        } else {
          showMessage('Confirmation email resent — check your inbox.', 'success');
        }
      } catch (err) {
        console.error('Resend confirmation threw:', err);
        showMessage(friendlyAuthError(err), 'error');
      } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend confirmation email';
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;
      const confirm = document.getElementById('register-confirm').value;

      if (password !== confirm) {
        showError('register', 'Passwords do not match');
        return;
      }

      if (password.length < 6) {
        showError('register', 'Password must be at least 6 characters');
        return;
      }

      try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });

        if (error) {
          console.error('Sign-up error:', error);
          showError('register', friendlyAuthError(error));
        } else {
          if (data.session) {
            showMessage('Account created! You are signed in.', 'success');
          } else {
            showMessage('Account created! Check your email to confirm your account before signing in.', 'success');
          }
          registerForm.reset();
          setTimeout(() => toggleView('signin'), 2000);
        }
      } catch (err) {
        console.error('Sign-up threw:', err);
        showError('register', friendlyAuthError(err));
      }
    });
  }

  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      signedinView.style.display = 'none';
      toggleView('signin');
    });
  }

  checkSession();
});
