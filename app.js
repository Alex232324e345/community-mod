const links = [...document.querySelectorAll('.nav a')];
const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`)); }), { rootMargin: '-35% 0px -55% 0px' });
sections.forEach((section) => observer.observe(section));

const form = document.querySelector('#mod-form');
const list = document.querySelector('#mod-list');
const message = document.querySelector('#form-message');
const savedMods = JSON.parse(localStorage.getItem('community-mods') || '[]');
const safe = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function addCard(mod) {
  const card = document.createElement('article');
  card.className = 'mod-card user-mod';
  card.innerHTML = `<div class="mod-icon">${safe(mod.name.slice(0, 2).toUpperCase())}</div><div class="mod-info"><div class="mod-title"><h3>${safe(mod.name)}</h3><span class="version">v${safe(mod.version)}</span></div><p>${safe(mod.description)}</p><div class="tag-row"><span>Community</span><span>User submitted</span></div></div><a class="button primary download-button" href="${safe(mod.url)}" target="_blank" rel="noreferrer">Download ↗</a>`;
  list.append(card);
}
savedMods.forEach(addCard);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const mod = Object.fromEntries(new FormData(form));
  const file = form.elements.file.files[0];
  if (!mod.url && !file) {
    message.textContent = 'Add a download URL or choose a mod file first.';
    return;
  }
  if (file) {
    mod.url = URL.createObjectURL(file);
    mod.fileName = file.name;
  } else {
    savedMods.push(mod);
    localStorage.setItem('community-mods', JSON.stringify(savedMods));
  }
  addCard(mod);
  form.reset();
  message.textContent = file ? `${file.name} added for download in this browser session.` : 'Mod submitted and added to the library on this browser.';
});
