const SUPABASE_URL = 'https://smzywlljyhcnymukakkc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tkN-c_D3CJBaNe9PZFc5Yw_WJ6VcuQx';
const ADMIN_EMAIL = 'hanz81441@gmail.com';

let session = null;
const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}`
});

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const form = document.querySelector('#mod-form');
const list = document.querySelector('#mod-list');
const message = document.querySelector('#form-message');
const count = document.querySelector('.stats strong');

function filePath(fileUrl) {
  const marker = '/storage/v1/object/public/mods/';
  if (!fileUrl?.includes(marker)) return null;
  return decodeURIComponent(fileUrl.split(marker)[1]);
}

async function getDownloadUrl(mod) {
  if (!mod.file_url) return mod.download_url || '';
  const path = filePath(mod.file_url);
  if (!path) return '';
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/mods/${path.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 })
    }
  );
  if (!response.ok) return '';
  const data = await response.json();
  return new URL(data.signedURL, SUPABASE_URL).toString();
}

async function renderMod(mod) {
  const card = document.createElement('article');
  card.className = 'mod-card user-mod';
  card.dataset.id = mod.id;
  card.innerHTML = `
    <div class="mod-icon">${escapeHtml((mod.name || '').slice(0, 2).toUpperCase())}</div>
    <div class="mod-info">
      <div class="mod-title">
        <h3>${escapeHtml(mod.name)}</h3>
        <span class="version">v${escapeHtml(mod.version)}</span>
      </div>
      <p>${escapeHtml(mod.description)}</p>
      <div class="tag-row"><span>Community</span><span>${escapeHtml(mod.file_name || 'Download link')}</span></div>
    </div>
    <button class="button primary download-button" type="button" disabled>Preparing download…</button>`;
  list.append(card);

  const target = await getDownloadUrl(mod);
  const button = card.querySelector('.download-button');
  if (!target) {
    button.textContent = 'Download unavailable';
    return;
  }

  button.disabled = false;
  button.textContent = `Download ↗ (${Number(mod.download_count || 0)})`;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_mod_download`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mod_id: mod.id })
      });
    } finally {
      window.open(target, '_blank', 'noopener,noreferrer');
      button.disabled = false;
    }
  });
}

async function loadMods() {
  list.innerHTML = '';
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/mods?select=*&published=eq.true&order=created_at.desc`,
    { headers: headers() }
  );
  if (!response.ok) throw new Error('Could not load mods.');
  const mods = await response.json();
  if (count) count.textContent = mods.length;
  await Promise.all(mods.map(renderMod));
}

loadMods().catch(() => {
  message.textContent = 'The mod database is not set up yet.';
});

const refresh = document.createElement('button');
refresh.className = 'refresh-button';
refresh.type = 'button';
refresh.textContent = '↻ Refresh mods';
refresh.onclick = () => loadMods().catch(() => {
  message.textContent = 'Could not refresh mods.';
});
document.querySelector('#mods').prepend(refresh);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const now = Date.now();
  const lastSubmit = Number(sessionStorage.getItem('community-mod-last-submit') || 0);
  if (now - lastSubmit < 30000) {
    message.textContent = 'Please wait 30 seconds before submitting again.';
    return;
  }

  const data = new FormData(form);
  const file = form.elements.file.files[0];
  const mod = {
    name: data.get('name'),
    version: data.get('version'),
    description: data.get('description'),
    download_url: data.get('url') || null,
    file_url: null,
    file_name: null,
    published: false
  };
  const button = form.querySelector('button[type="submit"]');

  if (!mod.download_url && !file) {
    message.textContent = 'Add a download URL or choose a mod file first.';
    return;
  }

  button.disabled = true;
  message.textContent = 'Submitting for admin review…';

  try {
    if (file) {
      if (file.size > 50 * 1024 * 1024) throw new Error('File is too large. Use a file smaller than 50 MB.');
      const path = `${crypto.randomUUID()}-${file.name}`;
      const upload = await fetch(
        `${SUPABASE_URL}/storage/v1/object/mods/${encodeURIComponent(path)}`,
        {
          method: 'POST',
          headers: { ...headers(), 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        }
      );
      if (!upload.ok) throw new Error('File upload failed.');
      mod.file_url = `${SUPABASE_URL}/storage/v1/object/public/mods/${encodeURIComponent(path)}`;
      mod.file_name = file.name;
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/mods`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(mod)
    });
    if (!response.ok) throw new Error('Database insert failed.');

    sessionStorage.setItem('community-mod-last-submit', String(now));
    form.reset();
    message.textContent = 'Submitted. Waiting for admin approval.';
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

const adminNav = document.querySelector('#admin-nav');
const adminSection = document.querySelector('#admin');
const admin = document.querySelector('#admin-login');
const review = document.querySelector('#admin-review');

async function loadPendingMods() {
  const box = review.querySelector('#pending-mods');
  box.textContent = 'Loading pending mods…';
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/mods?select=*&published=eq.false&order=created_at.desc`,
    { headers: headers() }
  );
  if (!response.ok) {
    box.textContent = 'Could not load pending mods.';
    return;
  }

  const mods = await response.json();
  box.innerHTML = mods.length ? '' : 'No pending mods.';
  mods.forEach(mod => {
    const row = document.createElement('div');
    row.textContent = `${mod.name} — v${mod.version}`;
    const approve = document.createElement('button');
    approve.textContent = 'Publish';
    approve.onclick = async () => {
      const result = await fetch(`${SUPABASE_URL}/rest/v1/mods?id=eq.${encodeURIComponent(mod.id)}`, {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ published: true })
      });
      if (result.ok) {
        row.remove();
        loadMods();
      }
    };
    row.append(' ', approve);
    box.append(row);
  });
}

admin.addEventListener('submit', async event => {
  event.preventDefault();
  const note = admin.querySelector('#admin-message');
  const data = new FormData(admin);
  note.textContent = 'Logging in…';

  if (data.get('email') !== ADMIN_EMAIL) {
    note.textContent = 'Login failed.';
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: data.get('email'), password: data.get('password') })
  });
  if (!response.ok) {
    note.textContent = 'Login failed.';
    return;
  }

  session = await response.json();
  adminNav.hidden = false;
  adminSection.hidden = false;
  note.textContent = 'Admin logged in.';
  loadPendingMods();
  location.hash = 'admin';
});


// Casual DevTools deterrent only. Browser users can always inspect client-side code.
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (
    event.key === 'F12' ||
    (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
    (event.ctrlKey && key === 'u')
  ) {
    event.preventDefault();
  }
});
