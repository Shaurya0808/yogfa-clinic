document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const newsletterForm = document.getElementById('newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = newsletterForm.querySelector('input[type="email"]').value;
      const subject = encodeURIComponent('Newsletter signup');
      const body = encodeURIComponent(`Hello Saurabh Wellness team,\n\nI'd like to subscribe to your newsletter.\nEmail: ${email}`);
      window.location.href = `mailto:hello@saurabhwellnesscenter.com?subject=${subject}&body=${body}`;
      const response = newsletterForm.querySelector('.form-note');
      if (response) response.textContent = 'Thanks for subscribing. Your email app should open with the signup details ready to send.';
    });
  }

  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = contactForm.querySelector('input[name="name"]').value;
      const email = contactForm.querySelector('input[name="email"]').value;
      const message = contactForm.querySelector('textarea[name="message"]').value;
      const subject = encodeURIComponent('Studio inquiry');
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);
      window.location.href = `mailto:hello@saurabhwellnesscenter.com?subject=${subject}&body=${body}`;
      const response = contactForm.querySelector('.form-note');
      if (response) response.textContent = 'Thanks for reaching out. Your email app should open with your message ready to send.';
    });
  }

  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.hero');
  function updateHeaderState() {
    if (!header) return;
    const threshold = 80;
    const scrollY = window.scrollY || window.pageYOffset;
    if (scrollY > threshold) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });

  if ('IntersectionObserver' in window && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    const revealElements = document.querySelectorAll('[data-reveal]');
    if (revealElements.length > 0) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const delay = parseInt(el.dataset.revealDelay) || 0;
            if (delay) {
              setTimeout(() => el.classList.add('visible'), delay);
            } else {
              el.classList.add('visible');
            }
            observer.unobserve(el);
          }
        });
      }, { threshold: 0.15 });

      revealElements.forEach(el => observer.observe(el));
    }
  } else {
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('visible'));
  }
});
