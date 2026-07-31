// ============================================================================
// Frontend booking config — PUBLIC values only.
// NEVER put the Razorpay key_secret here; it lives in the Edge Function env.
// ============================================================================

// Format Indian Rupees, e.g. 499 → "₹499", 1499 → "₹1,499".
// Declared FIRST, with no dependency on Supabase, so it is always defined.
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}
window.formatINR = formatINR;

const BOOKING_CONFIG = {
  // DEMO MODE: true → simulated gateway (UPI/card/netbanking/wallet) with
  // selectable success/fail/pending outcomes. No Razorpay account needed.
  // When you get your Razorpay keys, set this to false.
  DEMO_MODE: true,

  // Public Razorpay key (rzp_test_... for test mode, rzp_live_... for production)
  // Get it from https://dashboard.razorpay.com/app/keys
  RAZORPAY_KEY_ID: 'rzp_test_XXXXXX', // TODO: replace with your real public key

  // Tax rate shown in the summary breakdown (18% GST for fitness services in India)
  TAX_RATE: 0.18,

  // Branding shown inside the Razorpay checkout window
  COMPANY_NAME: 'Saurabh Wellness Center',
  COMPANY_EMAIL: 'bookings@saurabhwellness.com',
  COMPANY_LOGO: 'https://your-site.netlify.app/logo.png', // optional, remove if no logo
  THEME_COLOR: '#C68B59', // terracotta — matches the site palette

  // Edge Function base URL. If null it is derived from SUPABASE_URL.
  // Example: https://ymoggzekdxjkobljpxud.supabase.co/functions/v1
  EDGE_FN_BASE: null,

  // --------------------------------------------------------------------------
  // DEMO SCHEDULE — fallback classes shown on the booking page when the
  // database is empty or not set up yet. These IDs match the seed data in
  // supabase-schema.sql, so once you run it they are real, bookable classes.
  // dateOffset = how many days from "today" the offering is scheduled.
  // --------------------------------------------------------------------------
  DEMO_CLASSES: [
    {
      id: '11111111-1111-4111-8111-111111111101',
      name: 'Vinyasa Flow',
      description: 'Breath-led practice with clear sequencing, steady pace, and grounded movement.',
      instructor: 'Saurabh Negi',
      level: 'Intermediate',
      type: 'class',
      room: 'Main Studio',
      dateOffset: 1,
      start_time: '19:00',
      end_time: '19:50',
      duration_minutes: 50,
      price: 499.00,
      currency: 'INR',
      total_spots: 13,
      available_spots: 13,
    },
    {
      id: '11111111-1111-4111-8111-111111111102',
      name: 'Hatha Harmony',
      description: 'Gentle session with calm alignment, breath support, and mindful pacing.',
      instructor: 'Mohan Lal',
      level: 'All levels',
      type: 'class',
      room: 'Wellness Loft',
      dateOffset: 1,
      start_time: '19:30',
      end_time: '20:20',
      duration_minutes: 50,
      price: 399.00,
      currency: 'INR',
      total_spots: 8,
      available_spots: 8,
    },
    {
      id: '11111111-1111-4111-8111-111111111103',
      name: 'Power & Pulse',
      description: 'Heat and strength practice keeping space for grounding breath and focused energy.',
      instructor: 'Ashish Rayal',
      level: 'Beginner',
      type: 'class',
      room: 'Calm Corner',
      dateOffset: 2,
      start_time: '20:45',
      end_time: '21:30',
      duration_minutes: 45,
      price: 599.00,
      currency: 'INR',
      total_spots: 12,
      available_spots: 12,
    },
    {
      id: '11111111-1111-4111-8111-111111111104',
      name: 'Morning Meditation & Pranayama',
      description: 'Guided breathwork and seated meditation to start the day with stillness.',
      instructor: 'Saurabh Negi',
      level: 'All levels',
      type: 'class',
      room: 'Main Studio',
      dateOffset: 3,
      start_time: '06:30',
      end_time: '07:15',
      duration_minutes: 45,
      price: 299.00,
      currency: 'INR',
      total_spots: 15,
      available_spots: 15,
    },
    {
      id: '11111111-1111-4111-8111-111111111201',
      name: 'Private 1:1 Yoga Session',
      description: 'A personalised hour focused on your body, goals, and practice.',
      instructor: 'Saurabh Negi',
      level: 'All levels',
      type: 'session',
      room: 'Private Studio',
      dateOffset: 2,
      start_time: '10:00',
      end_time: '11:00',
      duration_minutes: 60,
      price: 1499.00,
      currency: 'INR',
      total_spots: 3,
      available_spots: 3,
    },
    {
      id: '11111111-1111-4111-8111-111111111202',
      name: 'Panchakarma Consultation',
      description: 'Ayurvedic consultation to design your personal cleanse & routine.',
      instructor: 'Mohan Lal',
      level: 'All levels',
      type: 'session',
      room: 'Wellness Loft',
      dateOffset: 4,
      start_time: '11:30',
      end_time: '12:15',
      duration_minutes: 45,
      price: 2999.00,
      currency: 'INR',
      total_spots: 5,
      available_spots: 5,
    },
    {
      id: '11111111-1111-4111-8111-111111111203',
      name: 'Meditation Mentoring',
      description: 'One-on-one guided practice to build a sustainable meditation habit.',
      instructor: 'Saurabh Negi',
      level: 'All levels',
      type: 'session',
      room: 'Calm Corner',
      dateOffset: 5,
      start_time: '09:00',
      end_time: '09:45',
      duration_minutes: 45,
      price: 899.00,
      currency: 'INR',
      total_spots: 6,
      available_spots: 6,
    },
  ],
};

// Derive the Edge Function base URL from the Supabase URL when not overridden.
// Guarded so a missing SUPABASE_URL can never break this file.
if (!BOOKING_CONFIG.EDGE_FN_BASE && typeof SUPABASE_URL !== 'undefined') {
  BOOKING_CONFIG.EDGE_FN_BASE = `${SUPABASE_URL}/functions/v1`;
}
