// Login səhifəsi
const forma = document.getElementById('forma');
const xeta = document.getElementById('xeta');
const dugme = document.getElementById('dugme');

forma.addEventListener('submit', async (e) => {
  e.preventDefault();
  xeta.classList.add('gizli');
  const ad = forma.ad.value.trim();
  const parol = forma.parol.value;
  if (!ad || !parol) {
    xeta.textContent = 'İstifadəçi adı və parolu yazın.';
    xeta.classList.remove('gizli');
    return;
  }
  dugme.disabled = true;
  dugme.textContent = 'Yoxlanılır…';
  try {
    const c = await fetch('/api/giris', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad, parol }),
    });
    if (c.ok) {
      location.replace('/');
      return;
    }
    const j = await c.json().catch(() => ({}));
    xeta.textContent = j.xeta || 'Giriş alınmadı.';
  } catch {
    xeta.textContent = 'Serverlə əlaqə yoxdur.';
  }
  xeta.classList.remove('gizli');
  forma.parol.value = '';
  forma.parol.focus();
  dugme.disabled = false;
  dugme.textContent = 'Daxil ol';
});
