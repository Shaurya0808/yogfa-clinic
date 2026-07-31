// ============================================================================
// Saurabh Wellness Center — Class Booking + Razorpay Checkout (frontend)
// Flow:  class list → booking summary → Razorpay order → checkout → confirm
// The booking row is created ONLY by the razorpay-webhook Edge Function after
// signature verification. This page polls for that row — never self-confirms.
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const classListEl = document.getElementById('class-list');
  const bookingSummaryEl = document.getElementById('booking-summary');
  const loginModalEl = document.getElementById('login-modal');
  const processingEl = document.getElementById('payment-processing');
  const confirmationEl = document.getElementById('confirmation-view');
  const failureEl = document.getElementById('payment-failure');
  const myBookingsEl = document.getElementById('my-bookings');
  const myBookingsList = document.getElementById('my-bookings-list');

  const state = {
    selectedClass: null,
    order: null,       // { order_id, amount, currency, key_id, class_id, price }
    accessToken: null,
    user: null,
    allClasses: [],
    filter: 'all',     // 'all' | 'class' | 'session'
    phone: '',
    usingFallback: false, // true when showing DEMO_CLASSES from config
  };

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  function fmtDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function fmtTime(t) {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function show(el) { el.style.display = 'block'; }
  function hide(el) { el.style.display = 'none'; }

  async function getSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
  }

  // --------------------------------------------------------------------------
  // 1. Load & render the class list
  // --------------------------------------------------------------------------

  function dateFromOffset(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function clearDemoNotice() {
    const existingNotice = document.querySelector('.demo-notice');
    if (existingNotice) existingNotice.remove();
  }

  async function loadClasses() {
    classListEl.innerHTML = '<p style="color:var(--muted);">Loading schedule…</p>';
    clearDemoNotice();

    const { data: classes, error } = await supabaseClient
      .from('classes')
      .select('*')
      .order('class_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error || !classes?.length) {
      renderDemoClasses();
      return;
    }

    state.usingFallback = false;
    state.allClasses = classes;
    renderClasses(classes);
  }

  async function loadMyBookings() {
    if (!state.user || !myBookingsEl || !myBookingsList) {
      if (myBookingsEl) hide(myBookingsEl);
      return;
    }

    myBookingsList.innerHTML = '<p style="color:var(--muted);">Loading your confirmed bookings…</p>';
    show(myBookingsEl);

    const { data: bookings, error } = await supabaseClient
      .from('bookings')
      .select('id, booking_reference, amount_paid, currency, payment_status, booking_status, class:classes(*)')
      .eq('user_id', state.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not load bookings', error);
      myBookingsList.innerHTML = '<p style="color:var(--muted);">Unable to load your bookings right now.</p>';
      return;
    }

    if (!bookings?.length) {
      myBookingsList.innerHTML = '<p style="color:var(--muted);">You have no confirmed bookings yet.</p>';
      return;
    }

    renderMyBookings(bookings);
  }

  function renderMyBookings(bookings) {
    myBookingsList.innerHTML = '';

    bookings.forEach((booking) => {
      const cls = booking.class;
      const card = document.createElement('article');
      card.className = 'booking-card';

      card.innerHTML = `
        <div class="booking-card-top">
          <span class="badge">${escapeHTML(booking.booking_status || 'Booked')}</span>
          <span class="booking-time">${fmtDate(cls.class_date)} • ${fmtTime(cls.start_time)}</span>
        </div>
        <h3>${escapeHTML(cls.name)}</h3>
        <p>${escapeHTML(cls.description || '')}</p>
        <div class="booking-meta">
          <span>Instructor: ${escapeHTML(cls.instructor)}</span>
          <span>Room: ${escapeHTML(cls.room || 'Main Studio')}</span>
        </div>
        <div class="booking-meta">
          <span>${escapeHTML(cls.level)}</span>
          <span>${cls.duration_minutes} min</span>
        </div>
        <div class="booking-card-footer">
          <span class="booking-price">${formatINR(booking.amount_paid)}</span>
          <div style="display:flex; align-items:center; gap:0.8rem; flex-wrap:wrap;">
            <button class="btn btn-secondary" data-ics="${booking.id}">Add to Calendar</button>
            <span style="font-size:0.9rem; color:var(--muted);">Ref: ${escapeHTML(booking.booking_reference)}</span>
          </div>
        </div>
      `;

      myBookingsList.appendChild(card);
      card.querySelector('[data-ics]')?.addEventListener('click', () => {
        const blob = new Blob([buildICS(cls)], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cls.name.replace(/\s+/g, '-')}.ics`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  function renderDemoClasses() {
    state.usingFallback = true;
    clearDemoNotice();

    const list = BOOKING_CONFIG.DEMO_CLASSES.map((c) => ({
      ...c,
      class_date: dateFromOffset(c.dateOffset),
    }));

    // Friendly notice so testers know payments are simulated
    const notice = document.createElement('div');
    notice.className = 'demo-notice';
    notice.innerHTML = '<strong>Demo schedule</strong> — payments in this preview are simulated and no real money is taken.';
    classListEl.parentNode.insertBefore(notice, classListEl);

    state.allClasses = list;
    renderClasses(list);
  }

  function setFilter(filter) {
    state.filter = filter;
    document.querySelectorAll('.filter-pill').forEach((b) => {
      b.classList.toggle('active', b.dataset.filter === filter);
    });
    const filtered = filter === 'all'
      ? state.allClasses
      : state.allClasses.filter((c) => c.type === filter);
    renderClasses(filtered);
  }

  function renderClasses(classes) {
    try {
      classListEl.innerHTML = '';
      classes.forEach((cls, i) => {
        const full = cls.available_spots <= 0 || cls.status === 'full';
        const card = document.createElement('article');
        card.className = 'booking-card';
        card.dataset.reveal = '';
        card.dataset.revealDelay = i * 100;

      card.innerHTML = `
        <div class="booking-card-top">
          <span class="badge">${cls.type === 'session' ? 'Session' : escapeHTML(cls.level)}</span>
          <span class="booking-time">${fmtTime(cls.start_time)} — ${fmtTime(cls.end_time)}</span>
        </div>
        <h3>${escapeHTML(cls.name)}</h3>
        <p>${escapeHTML(cls.description || '')}</p>
        <div class="booking-meta">
          <span>Teacher: ${escapeHTML(cls.instructor)}</span>
          <span>Room: ${escapeHTML(cls.room || 'Main Studio')}</span>
        </div>
        <div class="booking-meta">
          <span>${fmtDate(cls.class_date)}</span>
          <span>${cls.duration_minutes} min</span>
        </div>
        <div class="booking-card-footer">
          <span class="${full ? 'spots-full' : ''}">${full ? 'Fully Booked' : `${cls.available_spots}/${cls.total_spots} spots left`}</span>
          <div style="display:flex; align-items:center; gap:0.8rem;">
            <span class="booking-price">${formatINR(cls.price)}</span>
            <button class="btn btn-primary" ${full ? 'disabled' : ''} data-book="${cls.id}">
              ${full ? 'Full' : 'Book Now'}
            </button>
          </div>
        </div>
      `;

      classListEl.appendChild(card);

      card.querySelector('[data-book]').addEventListener('click', () => startBooking(cls));
      });

      if (typeof window.initScrollReveal === 'function') window.initScrollReveal();
    } catch (err) {
      console.error('Failed to render class cards:', err);
      classListEl.innerHTML = '';
      const fallback = document.createElement('p');
      fallback.className = 'demo-notice';
      fallback.textContent = 'We could not display the schedule right now. Please refresh the page and try again.';
      classListEl.appendChild(fallback);
    }
  }

  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // --------------------------------------------------------------------------
  // 2. Start booking — auth check + real-time capacity check
  // --------------------------------------------------------------------------

  async function startBooking(cls) {
    const session = await getSession();
    if (!session) {
      show(loginModalEl); // "you must sign in" — links to auth.html
      return;
    }
    state.accessToken = session.access_token;
    state.user = session.user;

    // Fallback demo classes (from config) are always assumed available.
    // Real DB classes are re-checked right now so we never offer a sold-out one.
    if (!state.usingFallback) {
      const { data, error } = await supabaseClient
        .from('classes')
        .select('*')
        .eq('id', cls.id)
        .single();

      if (error || !data) { alert('Class not found.'); return; }
      if (data.available_spots <= 0 || data.status === 'full') {
        alert('Sorry, this class is full. Please pick another session.');
        return;
      }
      cls = data;
    }

    state.selectedClass = cls;
    openSummary(cls);
  }

  // --------------------------------------------------------------------------
  // 3. Booking summary modal with tax breakdown + contact form
  // --------------------------------------------------------------------------

  function openSummary(cls) {
    const subtotal = parseFloat(cls.price);
    const tax = subtotal * BOOKING_CONFIG.TAX_RATE;
    const total = subtotal + tax;

    const name = state.user.user_metadata?.full_name || '';
    const email = state.user.email || '';

    bookingSummaryEl.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box">
          <button class="modal-close" id="summary-close" aria-label="Close">×</button>
          <span class="eyebrow">Booking summary</span>
          <h2 class="section-title" style="margin-bottom:0.2rem;">${escapeHTML(cls.name)}</h2>
          <p style="color:var(--muted); margin:0 0 1rem;">${fmtDate(cls.class_date)} • ${fmtTime(cls.start_time)}–${fmtTime(cls.end_time)} • ${cls.duration_minutes} min</p>

          <div class="summary-row"><span>Instructor</span><span>${escapeHTML(cls.instructor)}</span></div>
          <div class="summary-row"><span>Location</span><span>${escapeHTML(cls.room || 'Main Studio')}</span></div>
          <div class="summary-row"><span>Level</span><span>${escapeHTML(cls.level)}</span></div>

          <hr style="border:0; border-top:1px solid var(--border); margin:1rem 0;" />

          <div class="summary-row"><span>Class fee</span><span>${formatINR(subtotal)}</span></div>
          <div class="summary-row"><span>GST (${Math.round(BOOKING_CONFIG.TAX_RATE * 100)}%)</span><span>${formatINR(tax)}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span>${formatINR(total)}</span></div>

          <hr style="border:0; border-top:1px solid var(--border); margin:1rem 0;" />

          <div class="contact-fields">
            <label for="book-name">Full name</label>
            <input id="book-name" type="text" value="${escapeHTML(name)}" required />

            <label for="book-email">Email</label>
            <input id="book-email" type="email" value="${escapeHTML(email)}" required />

            <label for="book-phone">Phone (for SMS confirmation)</label>
            <input id="book-phone" type="tel" placeholder="+91 98XXX XXXXX" value="${escapeHTML(state.phone || '')}" required />
          </div>

          <div id="summary-error" class="auth-error" style="display:none; color:#c0392b; font-size:0.9rem; margin-bottom:0.75rem;"></div>

          <button class="btn btn-primary" id="proceed-payment" style="width:100%;">
            Proceed to Payment — ${formatINR(total)}
          </button>
          <p style="text-align:center; font-size:0.8rem; color:var(--muted); margin-top:0.75rem;">
            Secured by Razorpay • UPI (GPay, PhonePe, Paytm), Cards, Netbanking & Wallets
          </p>
        </div>
      </div>
    `;
    show(bookingSummaryEl);

    bookingSummaryEl.querySelector('#summary-close').addEventListener('click', () => hide(bookingSummaryEl));
    bookingSummaryEl.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) hide(bookingSummaryEl);
    });

    bookingSummaryEl.querySelector('#proceed-payment').addEventListener('click', proceedToPayment);
  }

  function getContactValues() {
    return {
      name: document.getElementById('book-name').value.trim(),
      email: document.getElementById('book-email').value.trim(),
      phone: document.getElementById('book-phone').value.trim(),
    };
  }

  // --------------------------------------------------------------------------
  // 4. Create Razorpay order (server-side) then open checkout
  // --------------------------------------------------------------------------

  async function proceedToPayment() {
    const { name, email, phone } = getContactValues();
    if (!name || !email || !phone) {
      const err = document.getElementById('summary-error');
      err.textContent = 'Please fill in your name, email and phone.';
      err.style.display = 'block';
      return;
    }
    if (!/^\+?[\d\s-]{10,15}$/.test(phone)) {
      const err = document.getElementById('summary-error');
      err.textContent = 'Please enter a valid phone number.';
      err.style.display = 'block';
      return;
    }
    state.phone = phone;
    localStorage.setItem('swc_phone', phone);

    const btn = document.getElementById('proceed-payment');
    btn.disabled = true;
    btn.textContent = 'Creating order…';

    // --- DEMO MODE: no real gateway yet → open the simulated checkout ---------
    if (BOOKING_CONFIG.DEMO_MODE) {
      btn.disabled = false;
      btn.textContent = 'Proceed to Payment';
      openDemoCheckout();
      return;
    }

    try {
      const res = await fetch(`${BOOKING_CONFIG.EDGE_FN_BASE}/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.accessToken}`,
        },
        body: JSON.stringify({ class_id: state.selectedClass.id, name, phone }),
      });

      const data = await res.json();
      if (res.status === 409) {
        alert('Sorry, this class just became full. Please choose another.');
        hide(bookingSummaryEl);
        loadClasses();
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not create order');

      state.order = data;
      await openRazorpayCheckout();
    } catch (err) {
      console.error('Order creation failed:', err);
      btn.disabled = false;
      btn.textContent = 'Proceed to Payment';
      const e = document.getElementById('summary-error');
      e.textContent = 'We could not start your payment. Please try again.';
      e.style.display = 'block';
    }
  }

  function loadRazorpayScript() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) return resolve();
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load Razorpay checkout'));
      document.head.appendChild(s);
    });
  }

  async function openRazorpayCheckout() {
    try {
      await loadRazorpayScript();
      const o = state.order;

      const options = {
        key: o.key_id,
        amount: o.amount,          // paise
        currency: o.currency,
        name: BOOKING_CONFIG.COMPANY_NAME,
        description: `${state.selectedClass.name} — ${state.selectedClass.instructor}`,
        image: BOOKING_CONFIG.COMPANY_LOGO,
        order_id: o.order_id,
        prefill: {
          name: getContactValues().name,
          email: getContactValues().email,
          contact: getContactValues().phone,
        },
        theme: { color: BOOKING_CONFIG.THEME_COLOR },
        // UPI / Cards / Netbanking / Wallets appear natively in this window.
        // handler fires on success — real confirmation still happens server-side.
        handler: handlePaymentSuccess,
        modal: { ondismiss: handleCheckoutDismiss },
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', handlePaymentFailure);
      rzp.open();
    } catch (err) {
      console.error('Razorpay checkout failed:', err);
      alert('The payment window could not be opened. Please try again.');
    }
  }

  // --------------------------------------------------------------------------
  // 4b. DEMO GATEWAY — simulated checkout (no Razorpay account needed)
  // Simulates UPI / Card / Netbanking / Wallet payment with a selectable
  // outcome so every UI state (success / failed / pending) can be demoed.
  // --------------------------------------------------------------------------

  const demoEl = document.getElementById('demo-checkout');

  function openDemoCheckout() {
    const cls = state.selectedClass;
    const subtotal = parseFloat(cls.price);
    const tax = subtotal * BOOKING_CONFIG.TAX_RATE;
    const total = subtotal + tax;

    demoEl.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box">
          <button class="modal-close" id="demo-close" aria-label="Close">×</button>
          <span class="eyebrow">Secure Checkout</span>
          <h2 class="section-title" style="margin-bottom:0.5rem;">${escapeHTML(cls.name)}</h2>
          <p style="color:var(--muted); margin:0 0 1rem;">${fmtDate(cls.class_date)} • ${fmtTime(cls.start_time)}–${fmtTime(cls.end_time)}</p>

          <div class="summary-row"><span>Class fee</span><span>${formatINR(subtotal)}</span></div>
          <div class="summary-row"><span>GST (${Math.round(BOOKING_CONFIG.TAX_RATE * 100)}%)</span><span>${formatINR(tax)}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span>${formatINR(total)}</span></div>

          <hr style="border:0; border-top:1px solid var(--border); margin:1rem 0;" />

          <p style="font-size:0.85rem; color:var(--accent); font-weight:600; margin:0 0 0.5rem;">Pay with</p>
          <div class="demo-methods" id="demo-methods">
            <label class="demo-method">
              <input type="radio" name="demo-method" value="upi" checked />
              <span><strong>UPI</strong> — GPay · PhonePe · Paytm</span>
            </label>
            <label class="demo-method">
              <input type="radio" name="demo-method" value="card" />
              <span><strong>Card</strong> — Credit / Debit</span>
            </label>
            <label class="demo-method">
              <input type="radio" name="demo-method" value="netbanking" />
              <span><strong>Netbanking</strong> — All major banks</span>
            </label>
            <label class="demo-method">
              <input type="radio" name="demo-method" value="wallet" />
              <span><strong>Wallet</strong> — Paytm · Amazon Pay</span>
            </label>
          </div>

          <div id="demo-method-detail" class="demo-method-detail">
            <div class="demo-upi">
              <div class="demo-qr">
                <svg width="64" height="64" viewBox="0 0 29 29" fill="none" stroke="#3B4A34"><path d="M1 1h7v7H1zM21 1h7v7h-7zM1 21h7v7H1zM8 5h2v2H8zM19 5h2v2h-2zM5 8h2v2H5zM22 8h2v2h-2zM5 19h2v2H5zM22 19h2v2h-2zM8 22h2v2H8zM19 22h2v2h-2zM11 11h7v7h-7zM11 1h2v7h-2zM16 1h2v7h-2zM1 11h7v2H1zM21 11h7v2h-7zM11 21h2v7h-2zM16 21h2v7h-2z"/></svg>
              </div>
              <div>
                <p style="margin:0 0 0.25rem;"><strong>UPI ID</strong></p>
                <input id="demo-upi-id" type="text" value="demo@upi" readonly style="width:100%; padding:0.6rem 0.8rem; border:1px solid var(--border); border-radius:10px; background:#f5f1ea; color:var(--text); font-size:0.9rem;" />
                <p style="font-size:0.8rem; color:var(--muted); margin:0.5rem 0 0;">Scan or enter the UPI ID in any app. (Simulated)</p>
              </div>
            </div>
          </div>

          <hr style="border:0; border-top:1px solid var(--border); margin:1rem 0;" />

          <label for="demo-outcome" style="font-size:0.85rem; color:var(--muted); display:block; margin-bottom:0.35rem;">
            Payment status
          </label>
          <select id="demo-outcome" style="width:100%; padding:0.6rem 0.8rem; border:1px solid var(--border); border-radius:10px; background:#fff; font-size:0.9rem; margin-bottom:1rem;">
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending (UPI)</option>
          </select>

          <button class="btn btn-primary" id="demo-pay" style="width:100%;">Pay ${formatINR(total)}</button>
          <p style="text-align:center; font-size:0.78rem; color:var(--muted); margin-top:0.6rem;">
            Demo payment — no real money is taken.
          </p>
        </div>
      </div>
    `;
    show(demoEl);

    demoEl.querySelector('#demo-close').addEventListener('click', () => hide(demoEl));
    demoEl.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) hide(demoEl);
    });

    // Show a method-specific detail pane
    demoEl.querySelectorAll('input[name="demo-method"]').forEach((r) => {
      r.addEventListener('change', renderDemoMethodDetail);
    });
    renderDemoMethodDetail();

    demoEl.querySelector('#demo-pay').addEventListener('click', simulateDemoPayment);
  }

  function renderDemoMethodDetail() {
    const method = (demoEl.querySelector('input[name="demo-method"]:checked') || {}).value || 'upi';
    const detail = demoEl.querySelector('#demo-method-detail');

    const panes = {
      upi: `
        <div class="demo-upi">
          <div class="demo-qr">
            <svg width="64" height="64" viewBox="0 0 29 29" fill="none" stroke="#3B4A34"><path d="M1 1h7v7H1zM21 1h7v7h-7zM1 21h7v7H1zM8 5h2v2H8zM19 5h2v2h-2zM5 8h2v2H5zM22 8h2v2h-2zM5 19h2v2H5zM22 19h2v2h-2zM8 22h2v2H8zM19 22h2v2h-2zM11 11h7v7h-7zM11 1h2v7h-2zM16 1h2v7h-2zM1 11h7v2H1zM21 11h7v2h-7zM11 21h2v7h-2zM16 21h2v7h-2z"/></svg>
          </div>
          <div style="flex:1;">
            <p style="margin:0 0 0.25rem;"><strong>UPI ID</strong></p>
            <input type="text" value="demo@upi" readonly style="width:100%; padding:0.6rem 0.8rem; border:1px solid var(--border); border-radius:10px; background:#f5f1ea; color:var(--text); font-size:0.9rem;" />
            <p style="font-size:0.8rem; color:var(--muted); margin:0.5rem 0 0;">Scan the QR or enter the UPI ID in GPay / PhonePe / Paytm. (Simulated)</p>
          </div>
        </div>`,
      card: `
        <div class="contact-fields">
          <label>Card number</label>
          <input type="text" value="4111 1111 1111 1111" readonly />
          <label>Expiry</label>
          <input type="text" value="12 / 29" readonly />
          <label>CVV</label>
          <input type="password" value="123" readonly />
          <p style="font-size:0.8rem; color:var(--muted); margin:0.5rem 0 0;">Demo card details are pre-filled. (Simulated)</p>
        </div>`,
      netbanking: `
        <select style="width:100%; padding:0.6rem 0.8rem; border:1px solid var(--border); border-radius:10px; background:#fff; font-size:0.9rem;">
          <option>HDFC Bank</option><option>State Bank of India</option>
          <option>ICICI Bank</option><option>Axis Bank</option>
          <option>Punjab National Bank</option>
        </select>
        <p style="font-size:0.8rem; color:var(--muted); margin:0.5rem 0 0;">You would be redirected to your bank's page. (Simulated)</p>`,
      wallet: `
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
          <span class="wallet-chip">Paytm</span>
          <span class="wallet-chip">Amazon Pay</span>
          <span class="wallet-chip">Mobikwik</span>
        </div>
        <p style="font-size:0.8rem; color:var(--muted); margin:0.5rem 0 0;">Wallet checkout (Simulated).</p>`,
    };
    detail.innerHTML = panes[method] || panes.upi;
  }

  function simulateDemoPayment() {
    const outcome = demoEl.querySelector('#demo-outcome').value;
    const btn = demoEl.querySelector('#demo-pay');
    btn.disabled = true;

    hide(demoEl);
    show(processingEl); // shared spinner

    setTimeout(async () => {
      if (outcome === 'failed') {
        hide(processingEl);
        btn.disabled = false;
        showFailure('Your payment was not completed. No charge was made. Please try again.');
        return;
      }
      if (outcome === 'pending') {
        // Simulate a pending UPI payment that later succeeds (like the
        // gateway → webhook → confirmed booking flow in production).
        processingEl.querySelector('.section-title').textContent = 'Payment pending…';
        processingEl.querySelector('p').textContent = 'Your payment is pending. We will confirm your booking automatically in a moment.';
        setTimeout(async () => {
          processingEl.querySelector('.section-title').textContent = 'Confirming your booking…';
          processingEl.querySelector('p').textContent = "Please wait — we're verifying your payment securely.";
          await demoConfirmPayment();
        }, 4000);
        return;
      }
      await demoConfirmPayment();
    }, 1800);
  }

  // Writes the booking + payment rows. This mirrors what the razorpay-webhook
  // does in production — it is the "verified" step of the demo flow.
  async function demoConfirmPayment() {
    const cls = state.selectedClass;
    const subtotal = parseFloat(cls.price);
    const total = subtotal + subtotal * BOOKING_CONFIG.TAX_RATE;
    const orderId = 'demo_order_' + Date.now();
    const paymentId = 'demo_pay_' + Date.now();
    const reference = 'SWC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const { name, email, phone } = getContactValues();

    try {
      // 0. If this class came from the demo schedule, persist it into the
      //    database first so the booking's foreign key resolves.
      if (state.usingFallback) {
        const { error: seedError } = await supabaseClient
          .rpc('ensure_demo_class', { p_class: cls });
        if (seedError) {
          console.error('ensure_demo_class failed:', seedError);
          throw new Error('setup_required');
        }
      }

      // 1. Booking row (RLS: user_id = auth.uid())
      const { data: booking, error: bookingError } = await supabaseClient
        .from('bookings')
        .insert({
          booking_reference: reference,
          user_id: state.user.id,
          class_id: cls.id,
          amount_paid: total.toFixed(2),
          currency: cls.currency || 'INR',
          payment_status: 'paid',
          booking_status: 'confirmed',
        })
        .select()
        .single();
      if (bookingError) throw bookingError;

      // 2. Payment row (needs the "payments_insert_own_demo" RLS policy)
      const { data: payment, error: paymentError } = await supabaseClient
        .from('payments')
        .insert({
          booking_id: booking.id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          gateway: 'demo',
          method: 'upi',
          amount: total.toFixed(2),
          currency: cls.currency || 'INR',
          status: 'paid',
        })
        .select()
        .single();
      if (paymentError) throw paymentError;

      // 3. Link payment → booking
      await supabaseClient.from('bookings').update({ payment_id: payment.id }).eq('id', booking.id);

      // 4. Decrement the class capacity (guarded RPC)
      await supabaseClient.rpc('decrement_class_spots', { p_class_id: cls.id });

      // 5. Upsert the user's contact profile
      await supabaseClient.from('users').upsert({
        id: state.user.id,
        email,
        full_name: name,
        phone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      // 6. Load the class for the confirmation screen & show it
      const { data: classRow } = await supabaseClient.from('classes').select('*').eq('id', cls.id).single();
      hide(processingEl);
      showConfirmation({ booking_reference: reference, amount_paid: total.toFixed(2), class: classRow || cls });
    } catch (err) {
      console.error('Demo booking failed:', err);
      hide(processingEl);
      showFailure(
        err.message === 'setup_required'
          ? 'Your booking could not be saved yet. Please try again in a few minutes.'
          : 'Something went wrong while saving your booking. Please try again.'
      );
    }
  }

  // --------------------------------------------------------------------------
  // 5. Payment outcomes — success / failure / dismissed
  // --------------------------------------------------------------------------

  function handlePaymentSuccess(response) {
    hide(bookingSummaryEl);
    show(processingEl); // spinner "Confirming your booking…"
    pollBookingStatus(state.order.order_id);
  }

  function handleCheckoutDismiss() {
    // Abandoned / pending — no confirmed booking is created by the backend.
    console.log('Checkout dismissed; no booking created.');
  }

  function handlePaymentFailure(response) {
    console.error('Payment failed', response.error);
    showFailure('Your payment was not completed. You can retry or choose another class.');
  }

  // Poll the DB until the webhook has written the confirmed booking.
  // This is the "never trust the frontend" guarantee — the row only exists
  // after razorpay-webhook verified the payment server-side.
  async function pollBookingStatus(orderId, attempt = 0) {
    try {
      const res = await fetch(`${BOOKING_CONFIG.EDGE_FN_BASE}/get-booking-status?order_id=${orderId}`);
      const data = await res.json();

      const booking = data.payment?.booking;
      if (data.payment?.status === 'failed') {
        showFailure('Payment was not completed. No charge was made.');
        return;
      }
      if (booking && booking.booking_status === 'confirmed') {
        showConfirmation(booking);
        return;
      }
    } catch (err) {
      console.warn('Polling error', err);
    }

    if (attempt < 24) { // ~60s at 2.5s intervals
      setTimeout(() => pollBookingStatus(orderId, attempt + 1), 2500);
    } else {
      showFailure('We are still confirming your payment. You will receive an email shortly. Check "My Bookings" in a few minutes.');
    }
  }

  function showFailure(msg) {
    hide(processingEl);
    failureEl.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box" style="text-align:center;">
          <div class="payment-state-icon fail">✕</div>
          <h2 class="section-title">Payment not completed</h2>
          <p style="color:var(--muted);">${escapeHTML(msg)}</p>
          <div style="display:flex; gap:0.8rem; justify-content:center;">
            <button class="btn btn-primary" id="failure-retry">Try Again</button>
            <button class="btn btn-secondary" id="failure-close">Back</button>
          </div>
        </div>
      </div>
    `;
    show(failureEl);
    failureEl.querySelector('#failure-retry').addEventListener('click', () => {
      hide(failureEl);
      if (state.selectedClass) openSummary(state.selectedClass);
    });
    failureEl.querySelector('#failure-close').addEventListener('click', () => {
      hide(failureEl);
      loadClasses();
    });
  }

  // --------------------------------------------------------------------------
  // 6. Confirmation screen + Add to Calendar
  // --------------------------------------------------------------------------

  function buildICS(cls) {
    const start = `${cls.class_date}T${cls.start_time}`;
    const end = `${cls.class_date}T${cls.end_time}`;
    const fmt = (d) => d.replace(/[-:]/g, '').replace('T', 'T').replace(/\.\d+/, '');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Saurabh Wellness//Booking//EN',
      'BEGIN:VEVENT',
      `UID:${cls.id}@saurabhwellness`,
      `DTSTAMP:${fmt(new Date().toISOString())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${cls.name}`,
      `DESCRIPTION:Yoga class with ${cls.instructor}`,
      `LOCATION:Saurabh Wellness Center, Dehradun`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  function showConfirmation(booking) {
    hide(processingEl);
    const cls = booking.class;

    confirmationEl.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box" style="text-align:center;">
          <div class="payment-state-icon success">✓</div>
          <h2 class="section-title">You're booked!</h2>
          <p style="color:var(--muted);">Booking reference</p>
          <div class="booking-ref">${booking.booking_reference}</div>

          <div class="confirm-card">
            <h3>${escapeHTML(cls.name)}</h3>
            <p>${fmtDate(cls.class_date)} • ${fmtTime(cls.start_time)}–${fmtTime(cls.end_time)}</p>
            <p>Instructor: ${escapeHTML(cls.instructor)} • ${escapeHTML(cls.room || 'Main Studio')}</p>
            <p><strong>${formatINR(booking.amount_paid)}</strong> paid • A confirmation email is on its way.</p>
          </div>

          <div style="display:flex; gap:0.8rem; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-primary" id="ics-download">Add to Calendar</button>
            <a class="btn btn-secondary" href="booking.html">View More Classes</a>
          </div>
        </div>
      </div>
    `;
    show(confirmationEl);

    confirmationEl.querySelector('#ics-download').addEventListener('click', () => {
      const blob = new Blob([buildICS(cls)], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cls.name.replace(/\s+/g, '-')}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    });

    if (state.user) {
      loadMyBookings();
    }
  }

  // --------------------------------------------------------------------------
  // Login modal (not signed in → redirect to auth)
  // --------------------------------------------------------------------------

  loginModalEl.addEventListener('click', (e) => {
    if (e.target.id === 'login-goto') return; // let the link work
    if (e.target.classList.contains('modal-backdrop') || e.target.id === 'login-cancel') {
      hide(loginModalEl);
    }
  });

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------

  // Class / Session filter pills
  document.querySelectorAll('.filter-pill').forEach((b) => {
    b.addEventListener('click', () => setFilter(b.dataset.filter));
  });

  async function init() {
    const session = await getSession();
    if (session) {
      state.accessToken = session.access_token;
      state.user = session.user;
      const { data: profile } = await supabaseClient
        .from('users')
        .select('phone')
        .eq('id', session.user.id)
        .maybeSingle();
      state.phone = profile?.phone || localStorage.getItem('swc_phone') || '';
    }
    await Promise.all([loadClasses(), loadMyBookings()]);
  }

  init();
});
