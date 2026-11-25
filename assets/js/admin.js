'use strict';

const SUPABASE_URL = 'https://shysndkekkobmzqrzehl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YoyRW91kIM3x2v03D7MTjQ_FfzicX3h';
const BUCKET = 'salon-storage';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Only a logged-in Supabase user can write, so the panel stays hidden until a session is confirmed.
const sessionReady = db.auth.getSession().then(({ data }) => {
  if (!data.session) {
    window.location.replace('./login.html');
    return false;
  }
  document.querySelector('.layout').hidden = false;
  return true;
});

db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') window.location.replace('./login.html');
});

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const CUT_CATEGORIES = { cut: 'Cut', 'cut-color': 'Cut & colour' };
const PHOTO_CATEGORIES = { cuts: 'Cuts', designs: 'Designs', colour: 'Colour' };
const TITLES = { dashboard: 'Dashboard', cuts: 'Cuts & Prices', gallery: 'Gallery', settings: 'Settings' };

let cuts = [];
let photos = [];
let photoFilter = 'all';

/* ---------- UI helpers ---------- */

let toastTimer;
function toast(message, type = 'ok') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function openModal(html) {
  $('modal-box').innerHTML = html;
  $('modal').classList.add('open');
}

function closeModal() {
  $('modal').classList.remove('open');
  $('modal-box').innerHTML = '';
}

function showSection(name) {
  document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === name));
  document.querySelectorAll('.nav-item[data-section]').forEach((n) => n.classList.toggle('active', n.dataset.section === name));
  $('page-title').textContent = TITLES[name];
}

function options(map, selected) {
  return Object.entries(map).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

async function run(button, task, errorMessage) {
  if (button) button.disabled = true;
  try {
    await task();
  } catch (err) {
    console.error(err);
    toast(`${errorMessage}: ${err.message || err}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- Images ---------- */

function resizeImage(file, maxSize, type, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read the image'))), type, quality);
    };
    img.onerror = () => reject(new Error('That file is not a valid image'));
    img.src = url;
  });
}

const blobToDataUrl = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(blob);
});

// Uploads to Supabase Storage; if the bucket is not set up yet, stores a small compressed copy in the database instead.
async function saveImage(file, folder, { transparent = false } = {}) {
  const type = transparent ? 'image/png' : 'image/jpeg';
  const blob = await resizeImage(file, transparent ? 600 : 1400, type, 0.85);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${transparent ? 'png' : 'jpg'}`;
  const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: type });
  if (!error) return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  console.warn('Storage upload failed, embedding image instead:', error.message);
  return blobToDataUrl(await resizeImage(file, transparent ? 400 : 900, type, 0.72));
}

async function removeStoredImage(url) {
  const marker = `/object/public/${BUCKET}/`;
  const index = (url || '').indexOf(marker);
  if (index === -1) return;
  await db.storage.from(BUCKET).remove([decodeURIComponent(url.slice(index + marker.length))]);
}

/* ---------- Cuts & prices (pricing table) ---------- */

async function loadCuts() {
  const { data, error } = await db.from('pricing').select('*').order('updated_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  cuts = data;
  $('stat-cuts').textContent = cuts.length;
  $('cuts-list').innerHTML = cuts.length ? cuts.map((c) => `
    <div class="item">
      ${c.image ? `<img src="${esc(c.image)}" alt="">` : '<img alt="">'}
      <div class="item-info"><b>${esc(c.title)}</b><span>${esc(c.meta)}</span><br><span class="tag">${esc(CUT_CATEGORIES[c.category] || c.category || '')}</span></div>
      <div class="item-price">${esc(c.price)}</div>
      <div class="item-actions">
        <button class="btn btn-light btn-sm" data-edit-cut="${esc(c.id)}">Edit</button>
        <button class="btn btn-danger btn-sm" data-delete-cut="${esc(c.id)}">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty">No cuts yet. Click “Add cut or hairstyle” to create the first one.</div>';
}

function openCutModal(id) {
  const c = cuts.find((x) => x.id === id) || {};
  openModal(`
    <h3>${id ? 'Edit cut' : 'Add cut or hairstyle'}</h3>
    <div class="field"><label for="c-title">Name</label><input id="c-title" value="${esc(c.title)}" placeholder="e.g. Fade cut"></div>
    <div class="row">
      <div class="field"><label for="c-price">Price</label><input id="c-price" value="${esc(c.price)}" placeholder="P100"></div>
      <div class="field"><label for="c-category">Type</label><select id="c-category">${options(CUT_CATEGORIES, c.category || 'cut')}</select></div>
    </div>
    <div class="field"><label for="c-meta">Details</label><input id="c-meta" value="${esc(c.meta)}" placeholder="e.g. Clean & simple · 1 hr"></div>
    <div class="field"><label for="c-image">Photo</label><input type="file" id="c-image" accept="image/*">
      ${c.image ? `<img class="preview" src="${esc(c.image)}" alt="">` : ''}</div>
    <div class="modal-actions">
      <button class="btn btn-light" data-close>Cancel</button>
      <button class="btn" id="save-cut" data-id="${esc(id || '')}">Save</button>
    </div>`);
}

async function saveCut(button) {
  const id = button.dataset.id;
  const title = $('c-title').value.trim();
  const price = $('c-price').value.trim();
  if (!title || !price) return toast('Please enter a name and a price', 'error');
  await run(button, async () => {
    const existing = cuts.find((x) => x.id === id);
    const file = $('c-image').files[0];
    const row = { id: id || newId('cut'), title, price, meta: $('c-meta').value.trim(), category: $('c-category').value, image: existing ? existing.image : null };
    if (file) {
      row.image = await saveImage(file, 'cuts');
      if (existing) await removeStoredImage(existing.image);
    }
    const { error } = await db.from('pricing').upsert(row);
    if (error) throw error;
    closeModal();
    await loadCuts();
    toast('Saved');
  }, 'Could not save');
}

async function deleteCut(id) {
  const cut = cuts.find((x) => x.id === id);
  if (!cut || !confirm(`Delete “${cut.title}”?`)) return;
  await run(null, async () => {
    const { error } = await db.from('pricing').delete().eq('id', id);
    if (error) throw error;
    await removeStoredImage(cut.image);
    await loadCuts();
    toast('Deleted');
  }, 'Could not delete');
}

/* ---------- Gallery ---------- */

async function loadGallery() {
  const { data, error } = await db.from('gallery').select('*').order('created_at', { ascending: false }).order('id', { ascending: true });
  if (error) throw error;
  photos = data;
  $('stat-photos').textContent = photos.length;
  renderGallery();
}

function renderGallery() {
  const tabs = { all: 'All', ...PHOTO_CATEGORIES };
  $('gallery-tabs').innerHTML = Object.entries(tabs).map(([key, label]) => `<button class="tab ${key === photoFilter ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('');
  const shown = photos.filter((p) => photoFilter === 'all' || p.category === photoFilter);
  $('gallery-grid').innerHTML = shown.length ? shown.map((p) => `
    <div class="photo">
      <img src="${esc(p.image)}" alt="" loading="lazy">
      <span class="tag">${esc(PHOTO_CATEGORIES[p.category] || p.category)}</span>
      <button class="btn btn-danger btn-sm" data-delete-photo="${esc(p.id)}">Delete</button>
    </div>`).join('') : '<div class="empty" style="grid-column: 1 / -1;">No photos here yet.</div>';
}

function openPhotoModal() {
  openModal(`
    <h3>Upload photos</h3>
    <div class="field"><label for="p-files">Choose one or more photos</label><input type="file" id="p-files" accept="image/*" multiple></div>
    <div class="field"><label for="p-category">Group</label><select id="p-category">${options(PHOTO_CATEGORIES, 'cuts')}</select>
      <small>Similar styles are grouped together on the Gallery page.</small></div>
    <div class="modal-actions">
      <button class="btn btn-light" data-close>Cancel</button>
      <button class="btn" id="upload-photos">Upload</button>
    </div>`);
}

async function uploadPhotos(button) {
  const files = [...$('p-files').files];
  if (!files.length) return toast('Please choose at least one photo', 'error');
  const category = $('p-category').value;
  await run(button, async () => {
    for (let i = 0; i < files.length; i++) {
      button.textContent = `Uploading ${i + 1} of ${files.length}…`;
      const image = await saveImage(files[i], 'gallery');
      const { error } = await db.from('gallery').insert({ id: newId('photo'), image, category });
      if (error) throw error;
    }
    closeModal();
    await loadGallery();
    toast(files.length === 1 ? 'Photo added' : `${files.length} photos added`);
  }, 'Could not upload');
  button.textContent = 'Upload';
}

async function deletePhoto(id) {
  const photo = photos.find((p) => p.id === id);
  if (!photo || !confirm('Delete this photo?')) return;
  await run(null, async () => {
    const { error } = await db.from('gallery').delete().eq('id', id);
    if (error) throw error;
    await removeStoredImage(photo.image);
    await loadGallery();
    toast('Photo deleted');
  }, 'Could not delete');
}
