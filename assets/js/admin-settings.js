'use strict';

/* ---------- Settings (site_info, contact, hours) ---------- */

let siteRow = null;
let logoUrl = null;
let bannerUrl = null;

function hoursRowHtml(h = {}) {
  return `<div class="hours-row">
    <input class="h-day" value="${esc(h.day)}" placeholder="Mon – Fri" aria-label="Days">
    <input class="h-open" value="${esc(h.open)}" placeholder="09:00" aria-label="Opens">
    <input class="h-close" value="${esc(h.close)}" placeholder="18:00" aria-label="Closes">
    <button class="btn btn-danger btn-sm" type="button" data-remove-hours>Remove</button>
  </div>`;
}

function showPreview(imgId, src) {
  const img = $(imgId);
  img.hidden = !src;
  if (src) img.src = src;
}

async function loadSettings() {
  const [site, contact, hours] = await Promise.all([
    db.from('site_info').select('*').eq('id', 1).maybeSingle(),
    db.from('contact').select('*').eq('id', 1).maybeSingle(),
    db.from('hours').select('*').order('id', { ascending: true })
  ]);
  for (const r of [site, contact, hours]) if (r.error) throw r.error;

  siteRow = site.data;
  const s = site.data || {};
  const c = contact.data || {};
  logoUrl = s.logo || null;
  bannerUrl = s.banner || null;
  $('s-name').value = s.name || '';
  $('s-tagline').value = s.tagline || '';
  $('s-desc').value = s.description || '';
  $('s-phone').value = c.phone || '';
  $('s-email').value = c.email || '';
  $('s-location').value = c.location || '';
  $('hours-list').innerHTML = hours.data.map(hoursRowHtml).join('');
  showPreview('logo-preview', logoUrl);
  showPreview('banner-preview', bannerUrl);
  renderSetupNotice();
}

function renderSetupNotice() {
  $('setup-notice').innerHTML = siteRow ? '' : `
    <div class="notice">
      <b>Your database is empty.</b>
      <p>The website is currently showing its built-in content. Copy that content here once, and from then on everything you change in this panel appears on the website.</p>
      <button class="btn" id="import-btn">Copy current website content</button>
    </div>`;
}

async function saveSettings(button) {
  const name = $('s-name').value.trim();
  const tagline = $('s-tagline').value.trim();
  if (!name || !tagline) return toast('Name and tagline are required', 'error');

  await run(button, async () => {
    const logoFile = $('s-logo').files[0];
    const bannerFile = $('s-banner').files[0];
    if (logoFile) logoUrl = await saveImage(logoFile, 'branding', { transparent: true });
    if (bannerFile) bannerUrl = await saveImage(bannerFile, 'branding');

    const rows = [...document.querySelectorAll('#hours-list .hours-row')]
      .map((row) => ({ day: row.querySelector('.h-day').value.trim(), open: row.querySelector('.h-open').value.trim(), close: row.querySelector('.h-close').value.trim() }))
      .filter((h) => h.day)
      .map((h, i) => ({ id: i + 1, ...h }));

    const results = await Promise.all([
      db.from('site_info').upsert({ id: 1, name, tagline, description: $('s-desc').value.trim(), logo: logoUrl, banner: bannerUrl, updated_at: new Date().toISOString() }),
      db.from('contact').upsert({ id: 1, phone: $('s-phone').value.trim(), email: $('s-email').value.trim(), location: $('s-location').value.trim(), updated_at: new Date().toISOString() }),
      rows.length ? db.from('hours').upsert(rows) : Promise.resolve({}),
      db.from('hours').delete().gt('id', rows.length)
    ]);
    for (const r of results) if (r.error) throw r.error;

    $('s-logo').value = '';
    $('s-banner').value = '';
    await loadSettings();
    toast('Settings saved. Your website is updated.');
  }, 'Could not save');
}

/* ---------- One-time import of the built-in website content ---------- */

async function importSiteContent(button) {
  await run(button, async () => {
    const data = await (await fetch('./data.json')).json();
    const now = new Date().toISOString();
    const results = await Promise.all([
      db.from('site_info').upsert({ id: 1, name: data.site.name, tagline: data.site.tagline, description: data.site.description, logo: null, banner: data.site.banner, updated_at: now }),
      db.from('contact').upsert({ id: 1, ...data.contact, updated_at: now }),
      db.from('hours').upsert(data.hours.map((h, i) => ({ id: i + 1, day: h.day, open: h.open, close: h.close }))),
      db.from('pricing').upsert(data.pricing.map((p) => ({ id: p.id, title: p.name, image: p.image, meta: p.meta, price: p.price, category: p.category }))),
      db.from('gallery').upsert(data.gallery.map((g) => ({ id: g.id, image: g.image, category: g.category })))
    ]);
    for (const r of results) if (r.error) throw r.error;
    await refreshAll();
    toast('Website content copied. You can now edit everything here.');
  }, 'Could not copy content');
}

/* ---------- Wiring ---------- */

async function refreshAll() {
  await run(null, async () => {
    await Promise.all([loadCuts(), loadGallery(), loadSettings()]);
  }, 'Could not load data');
}

document.addEventListener('click', (event) => {
  const t = event.target;
  const hit = (selector) => t.closest(selector);

  if (t === $('modal')) return closeModal();
  if (hit('[data-close]')) return closeModal();

  const nav = hit('[data-section]');
  if (nav) return showSection(nav.dataset.section);
  const goto = hit('[data-goto]');
  if (goto) return showSection(goto.dataset.goto);

  if (hit('#logout-btn')) return db.auth.signOut();

  if (hit('#add-cut-btn')) return openCutModal();
  const editCut = hit('[data-edit-cut]');
  if (editCut) return openCutModal(editCut.dataset.editCut);
  const delCut = hit('[data-delete-cut]');
  if (delCut) return deleteCut(delCut.dataset.deleteCut);
  if (hit('#save-cut')) return saveCut(hit('#save-cut'));

  if (hit('#add-photo-btn')) return openPhotoModal();
  if (hit('#upload-photos')) return uploadPhotos(hit('#upload-photos'));
  const delPhoto = hit('[data-delete-photo]');
  if (delPhoto) return deletePhoto(delPhoto.dataset.deletePhoto);
  const tab = hit('[data-tab]');
  if (tab) {
    photoFilter = tab.dataset.tab;
    return renderGallery();
  }

  if (hit('#add-hours-btn')) return $('hours-list').insertAdjacentHTML('beforeend', hoursRowHtml());
  const removeHours = hit('[data-remove-hours]');
  if (removeHours) return removeHours.closest('.hours-row').remove();
  if (hit('#save-settings-btn')) return saveSettings(hit('#save-settings-btn'));
  if (hit('#import-btn')) return importSiteContent(hit('#import-btn'));
  if (hit('#logo-reset')) {
    logoUrl = null;
    $('s-logo').value = '';
    return showPreview('logo-preview', null);
  }
});

$('s-logo').addEventListener('change', (e) => e.target.files[0] && showPreview('logo-preview', URL.createObjectURL(e.target.files[0])));
$('s-banner').addEventListener('change', (e) => e.target.files[0] && showPreview('banner-preview', URL.createObjectURL(e.target.files[0])));
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

sessionReady.then((ok) => ok && refreshAll());
