// Telefondan kadr şəkli: kamera ilə çək, önizlə, "Kadrı əlavə et" — şəkil brauzerdə kiçildilib JPEG göndərilir.
// <input capture> HTTPS tələb etmir (getUserMedia-dan fərqli) — panel daxili şəbəkədə HTTP ilə işləyir.
(() => {
  const $ = (s) => document.querySelector(s);
  const token = decodeURIComponent(location.pathname.split('/').pop() || '');
  const API = `/api/v1/sekil/${encodeURIComponent(token)}`;
  const MAKS = 1024;            // ən uzun tərəf, piksel
  let blob = null;

  const goster = (id) => {
    for (const x of ['#yuklenir', '#forma', '#ugur', '#bagli']) $(x).classList.toggle('gizli', x !== id);
  };
  const bagli = (metn) => { $('#bagli-metn').textContent = metn; goster('#bagli'); };
  const xeta = (metn) => { $('#xeta').textContent = metn; $('#xeta').classList.toggle('gizli', !metn); };

  async function basla() {
    try {
      const c = await fetch(API, { cache: 'no-store' });
      const j = await c.json().catch(() => ({}));
      if (!c.ok) return bagli(j.xeta || 'Link tapılmadı.');
      $('#ad').textContent = `${j.soyad} ${j.ad}`;
      goster('#forma');
    } catch {
      bagli('Serverə qoşulmaq olmadı. Telefonun universitet şəbəkəsinə (Wi-Fi) qoşulduğunu yoxlayın.');
    }
  }

  // şəkli oxu → ən çox 1024 px → JPEG 0.85 (HEIC/PNG da canvas ilə JPEG olur)
  function kicilt(fayl) {
    return new Promise((ok, red) => {
      const oxu = new FileReader();
      oxu.onerror = () => red(new Error('Şəkil oxunmadı'));
      oxu.onload = () => {
        const img = new Image();
        img.onerror = () => red(new Error('Bu şəkil formatı oxunmadı — kamera ilə yenidən çəkin'));
        img.onload = () => {
          const k = Math.min(1, MAKS / Math.max(img.naturalWidth, img.naturalHeight));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.naturalWidth * k);
          cv.height = Math.round(img.naturalHeight * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob((b) => (b ? ok({ b, url: cv.toDataURL('image/jpeg', 0.85) }) : red(new Error('Şəkil hazırlanmadı'))),
            'image/jpeg', 0.85);
        };
        img.src = oxu.result;
      };
      oxu.readAsDataURL(fayl);
    });
  }

  $('#cek').addEventListener('click', () => $('#fayl').click());
  $('#fayl').addEventListener('change', async () => {
    const f = $('#fayl').files?.[0];
    $('#fayl').value = '';
    if (!f) return;
    xeta('');
    try {
      const { b, url } = await kicilt(f);
      blob = b;
      const img = document.createElement('img');
      img.alt = 'Çəkilmiş şəkil';
      img.src = url;
      $('#onizleme').replaceChildren(img);
      $('#onizleme').classList.add('dolu');
      $('#cek span').textContent = 'Yenidən çək';
      $('#cek').classList.remove('esasli');
      $('#gonder').classList.remove('gizli');
    } catch (e) {
      xeta(e.message);
    }
  });

  $('#gonder').addEventListener('click', async () => {
    if (!blob) return;
    const d = $('#gonder');
    d.disabled = true;
    $('#cek').disabled = true;
    d.textContent = 'Göndərilir…';
    xeta('');
    try {
      const c = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      const j = await c.json().catch(() => ({}));
      if (c.ok) return goster('#ugur');
      if (c.status === 410 || c.status === 404) return bagli(j.xeta || 'Link işləmir.');
      xeta(j.xeta || 'Şəkil göndərilmədi, yenidən cəhd edin.');
    } catch {
      xeta('Şəbəkə xətası — Wi-Fi bağlantısını yoxlayıb yenidən cəhd edin.');
    }
    d.disabled = false;
    $('#cek').disabled = false;
    d.textContent = 'Kadrı əlavə et';
  });

  basla();
})();
