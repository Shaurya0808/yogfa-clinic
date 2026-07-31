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

  function showError(form, msg) {
    const el = form === 'login' ? document.getElementById('login-error') : document.getElementById('register-error');
    el.textContent = msg;
    el.style.display = 'block';
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
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    if (error) showMessage(error.message, 'error');
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
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (error) {
        showError('login', error.message);
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

      const { data, error } = await supabaseClient.auth.signUp({ email, password });

      if (error) {
        showError('register', error.message);
      } else {
        showMessage('Account created! Check your email to confirm.', 'success');
        registerForm.reset();
        setTimeout(() => toggleView('signin'), 2000);
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
