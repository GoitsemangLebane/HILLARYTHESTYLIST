'use strict';

/**
 * Load site data from Supabase (managed in admin.html), falling back to data.json
 */

const SUPABASE_REST = 'https://shysndkekkobmzqrzehl.supabase.co/rest/v1';
const SUPABASE_KEY = 'sb_publishable_YoyRW91kIM3x2v03D7MTjQ_FfzicX3h';

let siteData = null;

async function supabaseSelect(table, order) {
  const response = await fetch(`${SUPABASE_REST}/${table}?select=*&order=${order}`, {
    headers: { apikey: SUPABASE_KEY }
  });
  if (!response.ok) throw new Error(`${table}: ${response.status}`);
  return response.json();
}

async function loadFromSupabase(data) {
  const [site, contact, hours, pricing, gallery] = await Promise.all([
    supabaseSelect('site_info', 'id.asc'),
    supabaseSelect('contact', 'id.asc'),
    supabaseSelect('hours', 'id.asc'),
    supabaseSelect('pricing', 'updated_at.asc,id.asc'),
    supabaseSelect('gallery', 'created_at.desc,id.asc')
  ]);

  // Until the barber's content is set up (a site_info row exists), keep the data.json content
  if (!site.length) return;

  const clean = (row) => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== ''));
  data.site = { ...data.site, ...clean(site[0]) };
  data.site.customLogo = Boolean(site[0].logo);
  if (contact.length) data.contact = { ...data.contact, ...clean(contact[0]) };
  data.hours = hours;
  data.pricing = pricing.map(item => ({ ...item, name: item.title }));
  data.gallery = gallery;
}

async function loadSiteData() {
  try {
    const response = await fetch('./data.json');
    siteData = await response.json();
  } catch (error) {
    console.error('Error loading data.json:', error);
    siteData = { site: {}, contact: {}, hours: [], pricing: [], gallery: [] };
  }

  try {
    await loadFromSupabase(siteData);
  } catch (error) {
    console.warn('Supabase unavailable, using data.json:', error);
  }

  if (document.body.className !== 'admin-page') {
    populatePageContent();
  }
}

function populatePageContent() {
  if (!siteData) return;

  // Update basic site info
  updateSiteHeader();
  updatePricingCards();
  updateHours();
  updateContactInfo();
  updateBanner();
  updateGallery();
}

function updateSiteHeader() {
  document.querySelectorAll('.logo').forEach(logo => {
    if (siteData.site.customLogo) {
      logo.innerHTML = `<img src="${siteData.site.logo}" alt="${siteData.site.name}" style="height:40px;width:auto;display:block;">`;
    } else if (!logo.textContent.includes(siteData.site.name)) {
      logo.innerHTML = `${siteData.site.name}<span>${siteData.site.tagline}</span>`;
    }
  });
}

function updateBanner() {
  const bannerImg = document.querySelector('.hero-media img');
  if (bannerImg && siteData.site.banner) {
    bannerImg.src = siteData.site.banner;
  }
}

function updateContactInfo() {
  const contactList = document.querySelector('.contact-list');
  if (contactList) {
    const locationItem = contactList.querySelector('li:nth-child(1) span');
    const phoneItem = contactList.querySelector('li:nth-child(2) a');
    if (locationItem) locationItem.textContent = siteData.contact.location;
    if (phoneItem) {
      phoneItem.textContent = siteData.contact.phone;
      phoneItem.href = `tel:${siteData.contact.phone.replace(/\s/g, '')}`;
    }
  }

  const footerHours = document.querySelector('.footer-col:nth-child(2)');
  if (footerHours) {
    const hoursList = footerHours.querySelector('.footer-list');
    if (hoursList) {
      hoursList.innerHTML = siteData.hours
        .map(h => `<li><ion-icon name="time-outline" aria-hidden="true"></ion-icon> ${h.day}, ${h.open} – ${h.close}</li>`)
        .join('');
    }
  }

  const footerContact = document.querySelector('.footer-col:nth-child(3)');
  if (footerContact) {
    const contactList = footerContact.querySelector('.footer-list');
    if (contactList) {
      contactList.innerHTML = `
        <li><ion-icon name="call-outline" aria-hidden="true"></ion-icon> <a href="tel:${siteData.contact.phone.replace(/\s/g, '')}">${siteData.contact.phone}</a></li>
        <li><ion-icon name="mail-outline" aria-hidden="true"></ion-icon> <a href="mailto:${siteData.contact.email}">${siteData.contact.email}</a></li>
      `;
    }
  }
}

function updateHours() {
  // This is handled by updateContactInfo
}

function updatePricingCards() {
  const priceGrid = document.querySelector('.price-grid');
  if (priceGrid && siteData.pricing) {
    priceGrid.innerHTML = siteData.pricing
      .map(item => `
        <li class="price-card" data-filter="${item.category}">
          <img src="${item.image}" alt="${item.name}" loading="lazy" width="810" height="1080">
          <div class="price-body">
            <h3 class="price-name">${item.name}</h3>
            <p class="price-meta">${item.meta}</p>
            <p class="price-amount">${item.price}</p>
          </div>
        </li>
      `)
      .join('');
  }

  // Update service options in form
  const serviceSelect = document.querySelector('select[name="category"]');
  if (serviceSelect) {
    serviceSelect.innerHTML = `
      <option value="" disabled selected>Select a service</option>
      ${siteData.pricing.map(item => `<option value="${item.name}">${item.name}</option>`).join('')}
    `;
  }
}

function updateGallery() {
  const photoGrid = document.querySelector('.photo-grid');
  if (photoGrid && siteData.gallery) {
    photoGrid.innerHTML = siteData.gallery
      .map((photo, index) => `
        <li data-category="${photo.category}">
          <button type="button" class="photo-btn" data-photo-open="${photo.image}" aria-label="View photo ${index + 1}">
            <img src="${photo.image}" alt="Hillary's work, photo ${index + 1}" loading="lazy">
          </button>
        </li>
      `)
      .join('');

    // Rebind photo dialog listeners
    bindPhotoDialog();
  }

  const galleryPreview = document.querySelector('.gallery-grid');
  if (galleryPreview && siteData.gallery) {
    const previewPhotos = siteData.gallery.slice(0, 4);
    galleryPreview.innerHTML = previewPhotos
      .map(photo => `<li><img src="${photo.image}" alt="Recent hairstyle by Hillary" loading="lazy" width="422" height="550"></li>`)
      .join('');
  }
}

function bindPhotoDialog() {
  const photoDialog = document.querySelector('[data-photo-dialog]');
  if (photoDialog) {
    const photoImage = photoDialog.querySelector('[data-photo-image]');
    document.querySelectorAll('[data-photo-open]').forEach((btn) => {
      btn.removeEventListener('click', handlePhotoOpen);
      btn.addEventListener('click', handlePhotoOpen);
    });

    function handlePhotoOpen() {
      photoImage.src = this.dataset.photoOpen;
      photoImage.alt = this.querySelector('img').alt;
      photoDialog.showModal();
    }

    photoDialog.querySelector('[data-photo-close]').removeEventListener('click', handlePhotoClose);
    photoDialog.querySelector('[data-photo-close]').addEventListener('click', handlePhotoClose);

    function handlePhotoClose() {
      photoDialog.close();
    }

    photoDialog.removeEventListener('click', handlePhotoBackdrop);
    photoDialog.addEventListener('click', handlePhotoBackdrop);

    function handlePhotoBackdrop(event) {
      if (event.target === photoDialog) photoDialog.close();
    }
  }
}

// Load data on page load
loadSiteData();

/**
 * mobile navigation toggle
 */

const nav = document.querySelector('[data-nav]');
const navToggle = document.querySelector('[data-nav-toggle]');

if (nav && navToggle) {
  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen);
  });

  nav.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}


/**
 * header shadow after scrolling
 */

const header = document.querySelector('[data-header]');

const updateHeader = () => {
  header.classList.toggle('scrolled', window.scrollY > 10);
};

if (header) {
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
}


/**
 * pricing filter
 */

const filterBtns = document.querySelectorAll('[data-filter-btn]');
const priceCards = document.querySelectorAll('[data-filter]');

filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const selected = btn.dataset.filterBtn;

    filterBtns.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive);
    });

    priceCards.forEach((card) => {
      card.hidden = !(selected === 'all' || card.dataset.filter === selected);
    });
  });
});


/**
 * gallery filter and lightbox
 */

const galleryFilterBtns = document.querySelectorAll('[data-gallery-filter]');
const galleryItems = document.querySelectorAll('[data-category]');

galleryFilterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const selected = btn.dataset.galleryFilter;

    galleryFilterBtns.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive);
    });

    galleryItems.forEach((item) => {
      item.hidden = !(selected === 'all' || item.dataset.category === selected);
    });
  });
});

const photoDialog = document.querySelector('[data-photo-dialog]');

if (photoDialog) {
  const photoImage = photoDialog.querySelector('[data-photo-image]');

  document.querySelectorAll('[data-photo-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      photoImage.src = btn.dataset.photoOpen;
      photoImage.alt = btn.querySelector('img').alt;
      photoDialog.showModal();
    });
  });

  photoDialog.querySelector('[data-photo-close]').addEventListener('click', () => photoDialog.close());

  photoDialog.addEventListener('click', (event) => {
    if (event.target === photoDialog) photoDialog.close();
  });
}
