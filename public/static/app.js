// AzTU HR paneli — brauzer tərəfi (çərçivəsiz). Səhifələr: #/umumi, #/emekdaslar, #/emekdas/<id>, #/hesabat.
// Təhlükəsizlik: serverdən gələn hər mətn esc() ilə və ya textContent ilə yazılır. CSP daxili style atributunu
// qadağan edir — mövqe/en dəyərləri data-x / data-w atributlarından JS ilə (el.style) qoyulur.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const sehife = $('#sehife');

let MEN = null;
let taymer = null;

// ================================================================ server
async function api(yol, opt = {}) {
  const c = await fetch(yol, { ...opt, headers: { 'X-Aztu': '1', ...(opt.headers || {}) } });
  if (c.status === 401) {
    location.replace('/giris');
    throw new Error('Sessiya bitib');
  }
  const j = await c.json().catch(() => ({}));
  if (!c.ok) throw new Error(j.xeta || `Xəta (${c.status})`);
  return j;
}

async function excelEndir(parametrler, dugme) {
  const kohne = dugme.innerHTML;
  dugme.disabled = true;
  dugme.textContent = 'Hazırlanır…';
  try {
    const c = await fetch(`/api/hesabat/excel?${parametrler}`, { headers: { 'X-Aztu': '1' } });
    if (c.status === 401) { location.replace('/giris'); return; }
    if (!c.ok) throw new Error((await c.json().catch(() => ({}))).xeta || 'Excel hazırlanmadı');
    const ad = /filename="([^"]+)"/.exec(c.headers.get('content-disposition') || '')?.[1] || 'davamiyyet.xlsx';
    const url = URL.createObjectURL(await c.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: ad });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    alert(e.message);
  } finally {
    dugme.disabled = false;
    dugme.innerHTML = kohne;
  }
}

// ================================================================ formatlar
const pad = (x) => String(x).padStart(2, '0');
const tarixObj = (t) => new Date(`${t}T00:00:00Z`);
const tarixStr = (d) => d.toISOString().slice(0, 10);
const gunEkle = (t, n) => { const d = tarixObj(t); d.setUTCDate(d.getUTCDate() + n); return tarixStr(d); };
const ayBasi = (t) => `${t.slice(0, 7)}-01`;
const ayinSonu = (ay) => { const d = tarixObj(`${ay}-01`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return tarixStr(d); };
const AYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const HEFTE_QISA = ['B.', 'B.e.', 'Ç.a.', 'Ç.', 'C.a.', 'C.', 'Ş.'];
const tarixYaz = (t) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : '—');
const tarixUzun = (t) => `${Number(t.slice(8, 10))} ${AYLAR[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
const hefteQisa = (t) => HEFTE_QISA[tarixObj(t).getUTCDay()];
const isGunu = (t) => ![0, 6].includes(tarixObj(t).getUTCDay());
const saatQisa = (s) => (s ? s.slice(0, 5) : '—');
const sn = (s) => { const [h, m, x = 0] = String(s).split(':').map(Number); return h * 3600 + m * 60 + x; };
const reqem = (n) => Number(n || 0).toLocaleString('az-AZ');
const indiSaat = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

/** "42 dəq", "1 saat 30 dəq", "2 saat" — serverdəki davamiyyet.muddetSoz ilə eyni */
function muddetSoz(san) {
  if (san === null || san === undefined) return '—';
  if (san > 0 && san < 30) return '1 dəq-dən az';
  const deq = Math.round(san / 60);
  const s = Math.floor(deq / 60);
  const d = deq % 60;
  if (!s) return `${d} dəq`;
  return d ? `${s} saat ${d} dəq` : `${s} saat`;
}
const aralikYaz = (b) => `${saatQisa(b.cixis)}–${saatQisa(b.qayitma)}`;

const basHerf = (e) => `${(e.ad || '?')[0]}${(e.soyad || '')[0] || ''}`.toUpperCase();
const sekilUrl = (id) => `/api/emekdaslar/${encodeURIComponent(id)}/sekil`;
const avatar = (e, sinif = 'avatar') => (e.sekil_var
  ? `<img class="${sinif}" src="${sekilUrl(e.id)}" alt="" loading="lazy">`
  : `<div class="${sinif}" aria-hidden="true">${esc(basHerf(e))}</div>`);
const tamAd = (e) => `${e.ad ?? ''} ${e.soyad ?? ''}`.trim();
const kartUrl = (id) => `#/emekdas/${encodeURIComponent(id)}`;

const IKON = {
  excel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M14 3v5.5h5.5M9 12l5 6M14 12l-5 6"/></svg>',
  axtar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  giris: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  cixis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  geri: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  yenile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg>',
  bagla: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  gun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  ay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  avto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  karta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
};
const yon = (i) => (i === 'cixis'
  ? `<span class="yon cixis">${IKON.cixis}Çıxış</span>` : `<span class="yon giris">${IKON.giris}Giriş</span>`);
const KATEQORIYA = {
  emekdas: '<span class="nisan info">Əməkdaş</span>', telebe: '<span class="nisan boz">Tələbə</span>',
  taninmayan: '<span class="nisan warn">Tanınmayan</span>', diger: '<span class="nisan boz">Digər</span>',
};

function debounce(f, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); };
}
const xetaHtml = (e) => `<div class="xeta-qutu">${esc(e.message || e)}</div>`;

/** data-x / data-w (faiz) → el.style (CSP daxili style atributuna icazə vermir) */
function yerlesdir(kok) {
  for (const el of $$('[data-x], [data-w]', kok)) {
    if (el.dataset.x !== undefined) el.style.left = `${el.dataset.x}%`;
    if (el.dataset.w !== undefined) el.style.width = `${el.dataset.w}%`;
  }
}

function yenilenib(id = 'yenilenib') {
  const el = $(`#${id}`);
  if (el) el.textContent = `Yenilənib ${indiSaat()}`;
}

// ================================================================ tema
const TEMALAR = ['auto', 'light', 'dark'];
const TEMA_ADI = { auto: 'Tema: avtomatik', light: 'Tema: açıq', dark: 'Tema: tünd' };
function temaQur() {
  const d = $('#tema');
  let t = 'auto';
  try { t = localStorage.getItem('aztu-tema') || 'auto'; } catch { /* yaddaş yoxdur */ }
  const ciz = () => {
    d.innerHTML = { auto: IKON.avto, light: IKON.gun, dark: IKON.ay }[t];
    d.title = TEMA_ADI[t];
    d.setAttribute('aria-label', TEMA_ADI[t]);
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  d.addEventListener('click', () => {
    t = TEMALAR[(TEMALAR.indexOf(t) + 1) % 3];
    try { localStorage.setItem('aztu-tema', t); } catch { /* yaddaş yoxdur */ }
    ciz();
    if ($('#u-qrafik')) qrafikYeniden();
  });
  ciz();
}

// ================================================================ ipucu (tooltip)
const ipucu = $('#ipucu');
function ipucuGoster(x, y, qur) {
  ipucu.replaceChildren();
  qur(ipucu);
  ipucu.classList.remove('gizli');
  const r = ipucu.getBoundingClientRect();
  ipucu.style.left = `${Math.min(window.innerWidth - r.width - 8, x + 14)}px`;
  ipucu.style.top = `${Math.max(8, y - r.height - 12)}px`;
}
const ipucuGizle = () => ipucu.classList.add('gizli');
const el = (tag, sinif, metn) => { const e = document.createElement(tag); if (sinif) e.className = sinif; if (metn !== undefined) e.textContent = metn; return e; };

// ================================================================ müddət seçicisi
const MUDDET_ADLARI = { bugun: 'Bu gün', dunen: 'Dünən', son7: 'Son 7 gün', buay: 'Bu ay', kecenay: 'Keçən ay', gun: 'Gün', ay: 'Ay', araliq: 'Aralıq' };

function muddetHesabla(m) {
  const b = MEN.bugun;
  switch (m.nov) {
    case 'bugun': return Object.assign(m, { bas: b, son: b });
    case 'dunen': { const d = gunEkle(b, -1); return Object.assign(m, { bas: d, son: d }); }
    case 'son7': return Object.assign(m, { bas: gunEkle(b, -6), son: b });
    case 'buay': return Object.assign(m, { bas: ayBasi(b), son: b });
    case 'kecenay': { const s = gunEkle(ayBasi(b), -1); return Object.assign(m, { bas: ayBasi(s), son: s }); }
    case 'gun': { const g = m.gun || b; return Object.assign(m, { gun: g, bas: g, son: g }); }
    case 'ay': {
      const ay = m.ay || b.slice(0, 7);
      const son = ayinSonu(ay);
      return Object.assign(m, { ay, bas: `${ay}-01`, son: son > b ? b : son });
    }
    default: {
      const bas = m.araliqBas || gunEkle(b, -6);
      const son = m.araliqSon || b;
      return Object.assign(m, { araliqBas: bas, araliqSon: son, bas: bas <= son ? bas : son, son: bas <= son ? son : bas });
    }
  }
}

function muddetQur(qab, m, secimler, deyisdi) {
  const ciz = () => {
    muddetHesabla(m);
    let elave = '';
    if (m.nov === 'gun') elave = `<input type="date" data-m="gun" value="${m.gun}" max="${MEN.bugun}" aria-label="Gün">`;
    if (m.nov === 'ay') elave = `<input type="month" data-m="ay" value="${m.ay}" max="${MEN.bugun.slice(0, 7)}" aria-label="Ay">`;
    if (m.nov === 'araliq') {
      elave = `<input type="date" data-m="araliqBas" value="${m.araliqBas}" max="${MEN.bugun}" aria-label="Başlanğıc tarixi">
        <span class="alt-metn">—</span><input type="date" data-m="araliqSon" value="${m.araliqSon}" max="${MEN.bugun}" aria-label="Son tarix">`;
    }
    qab.innerHTML = `<div class="seq" role="group" aria-label="Müddət">${secimler.map((n) => `<button type="button"
      data-muddet="${n}" class="${m.nov === n ? 'aktiv' : ''}" aria-pressed="${m.nov === n}">${MUDDET_ADLARI[n]}</button>`).join('')}</div>${elave}`;
    for (const d of $$('[data-muddet]', qab)) d.addEventListener('click', () => { m.nov = d.dataset.muddet; ciz(); deyisdi(); });
    for (const i of $$('[data-m]', qab)) {
      i.addEventListener('change', () => { if (i.value) { m[i.dataset.m] = i.value; muddetHesabla(m); deyisdi(); } });
    }
  };
  ciz();
}
const muddetMetni = (m) => (m.bas === m.son ? tarixUzun(m.bas) : `${tarixYaz(m.bas)} — ${tarixYaz(m.son)}`);

// ================================================================ günün zaman xətti
/** Binada olduğu (mavi) və kənarda olduğu (zolaqlı) hissələr; iş qrafiki fon kimi */
function xettParcalari(s, indi) {
  if (!s.gelis) return null;
  const bas = sn(s.gelis);
  let son;
  let natamam = false;
  if (s.cixis) son = sn(s.cixis);
  else if (s.binadadir && indi) son = Math.max(bas, sn(indi));
  else { son = sn(s.sonGorunme || s.gelis); natamam = true; }
  const ic = [];
  const kenar = [];
  let t = bas;
  for (const b of s.bosluqlar || []) {
    if (sn(b.cixis) > t) ic.push([t, sn(b.cixis)]);
    kenar.push([sn(b.cixis), sn(b.qayitma), b]);
    t = sn(b.qayitma);
  }
  if (son > t) ic.push([t, son]);
  return { bas, son, ic, kenar, natamam };
}

function gunXetti(s, { kicik = false, indi = null, aBas = 6, aSon = 22 } = {}) {
  const p = xettParcalari(s, indi);
  let A = aBas * 3600;
  let B = aSon * 3600;
  if (p && !kicik) {
    A = Math.min(A, Math.floor(p.bas / 3600) * 3600);
    B = Math.max(B, Math.ceil(p.son / 3600) * 3600);
  }
  const x = (t) => Math.max(0, Math.min(100, ((t - A) / (B - A)) * 100)).toFixed(2);
  const w = (a, b) => Math.max(0.4, ((b - a) / (B - A)) * 100).toFixed(2);
  const [pb, ps] = [sn(`${MEN.isBaslama}:00`), sn(`${MEN.isBitme}:00`)];
  let ic = `<div class="plan" data-x="${x(pb)}" data-w="${w(pb, ps)}" title="İş qrafiki ${MEN.isBaslama}–${MEN.isBitme}"></div>`;
  if (p) {
    for (const [a, b] of p.ic) {
      ic += `<div class="ic${p.natamam ? ' natamam' : ''}" data-x="${x(a)}" data-w="${w(a, b)}" title="Binada: ${saatQisa(saatYaz(a))}–${saatQisa(saatYaz(b))} (${muddetSoz(b - a)})"></div>`;
    }
    for (const [a, b, g] of p.kenar) {
      ic += `<div class="kenar" data-x="${x(a)}" data-w="${w(a, b)}" title="Kənarda: ${aralikYaz(g)} (${muddetSoz(g.san)})"></div>`;
    }
  }
  if (indi && !kicik && s.tarix === MEN.bugun) ic += `<div class="indi" data-x="${x(sn(indi))}" title="İndi ${saatQisa(indi)}"></div>`;
  const etiket = p ? `Binada ${saatQisa(s.gelis)}-dan ${s.cixis ? `${saatQisa(s.cixis)}-dək` : ''}, kənarda ${muddetSoz(s.olmamaSan)}` : 'Keçid yoxdur';
  let oxu = '';
  if (!kicik) {
    const addim = (B - A) / 3600 > 14 ? 2 : 1;
    for (let h = A / 3600; h <= B / 3600; h += addim) oxu += `<span data-x="${x(h * 3600)}">${pad(h)}:00</span>`;
    oxu = `<div class="xett-oxu" aria-hidden="true">${oxu}</div>`;
  }
  return `<div class="xett${kicik ? ' kicik' : ''}" role="img" aria-label="${esc(etiket)}">${ic}</div>${oxu}`;
}
const saatYaz = (t) => `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(Math.round(t % 60) % 60)}`;

/** Kənarda olduğu vaxtlar: hər aralıq və müddəti, sonda cəmi */
function kenarHucre(s) {
  if (!s.bosluqlar?.length) return s.gelis ? '<span class="alt-metn">çıxmayıb</span>' : '';
  return `<div class="kenar-metn"><b>${muddetSoz(s.olmamaSan)}</b><span class="alt-metn">${s.bosluqlar.map((b) => `${aralikYaz(b)} · ${muddetSoz(b.san)}`).join('<br>')}</span></div>`;
}

// ================================================================ qrafik (SVG, kitabxanasız; dataviz qaydaları)
let QRAFIK = null;     // {seriya, m} — tema/ölçü dəyişəndə yenidən çəkmək üçün
const SERIYALAR = [['s1', 'Əməkdaş'], ['s2', 'Tələbə'], ['s3', 'Tanınmayan']];
const seriyaNo = (k) => (k === 'emekdas' ? 0 : k === 'telebe' ? 1 : 2);

function yuvarlaqUst(x, y, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function qrafikCiz(qab, seriya, m) {
  QRAFIK = { seriya, m };
  const saatlar = seriya.nov === 'saat';
  const acarlar = saatlar ? Array.from({ length: 24 }, (_, i) => pad(i)) : [];
  if (!saatlar) for (let t = m.bas; t <= m.son; t = gunEkle(t, 1)) acarlar.push(t);
  const veri = new Map(acarlar.map((a) => [a, [0, 0, 0]]));
  for (const s of seriya.setirler) {
    const v = veri.get(s.acar);
    if (v) v[seriyaNo(s.kateqoriya)] += s.n;
  }
  const W = Math.max(320, qab.clientWidth - 28 || 800);
  const H = 240;
  const [sol, alt, ust] = [34, 24, 10];
  const maks = Math.max(1, ...[...veri.values()].map((v) => v[0] + v[1] + v[2]));
  const addim = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((a) => a * 4 >= maks) || Math.ceil(maks / 4);
  const tavan = addim * 4;
  const yer = (W - sol - 6) / acarlar.length;
  const bw = Math.max(3, Math.min(24, yer * 0.62));
  const y = (v) => ust + (H - ust - alt) * (1 - v / tavan);
  let svg = '';
  for (let i = 0; i <= 4; i += 1) {
    const v = addim * i;
    svg += `<line class="${i ? 'xett' : 'baz'}" x1="${sol}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" stroke-width="1"/>`
      + `<text x="${sol - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? `${v / 1000}K` : v}</text>`;
  }
  const hersi = Math.max(1, Math.ceil(acarlar.length / Math.floor((W - sol) / 44)));
  acarlar.forEach((a, i) => {
    const v = veri.get(a);
    const x0 = sol + i * yer + (yer - bw) / 2;
    let g = `<rect class="hedef" x="${sol + i * yer}" y="${ust}" width="${yer}" height="${H - ust - alt}"/>`;
    let alt0 = 0;
    const ustSeriya = v[2] ? 2 : v[1] ? 1 : 0;
    v.forEach((n, k) => {
      if (!n) return;
      const y1 = y(alt0);
      const y2 = y(alt0 + n);
      const bosluq = alt0 > 0 ? 2 : 0;                 // seqmentlər arası 2px səth boşluğu
      const h = Math.max(1, y1 - y2 - bosluq);
      g += k === ustSeriya
        ? `<path class="${SERIYALAR[k][0]}" d="${yuvarlaqUst(x0, y2, bw, h, 4)}"/>`
        : `<rect class="${SERIYALAR[k][0]}" x="${x0}" y="${y2}" width="${bw}" height="${h}"/>`;
      alt0 += n;
    });
    svg += `<g class="sutun" tabindex="0" data-i="${i}" role="img" aria-label="${esc(saatlar ? `${a}:00` : tarixYaz(a))}: ${v[0] + v[1] + v[2]} keçid">${g}</g>`;
    if (i % hersi === 0) {
      svg += `<text x="${sol + i * yer + yer / 2}" y="${H - 6}" text-anchor="middle">${saatlar ? a : `${a.slice(8)}.${a.slice(5, 7)}`}</text>`;
    }
  });
  qab.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-label="Keçidlərin paylanması">${svg}</svg>`;
  const goster = (g, ev) => {
    const a = acarlar[Number(g.dataset.i)];
    const v = veri.get(a);
    const r = g.getBoundingClientRect();
    ipucuGoster(ev?.clientX ?? r.right, ev?.clientY ?? r.top + 20, (k) => {
      k.append(el('div', 'bas', saatlar ? `${a}:00 – ${a}:59` : `${tarixYaz(a)}, ${hefteQisa(a)}`));
      SERIYALAR.forEach(([sinif, ad], i) => {
        const s = el('div', 's');
        const xett = el('i');
        xett.style.background = `var(--${sinif})`;
        s.append(xett, el('b', '', String(v[i])), el('span', '', ad));
        k.append(s);
      });
      const c = el('div', 's');
      c.append(el('i'), el('b', '', String(v[0] + v[1] + v[2])), el('span', '', 'cəmi'));
      k.append(c);
    });
  };
  for (const g of $$('.sutun', qab)) {
    g.addEventListener('pointermove', (ev) => goster(g, ev));
    g.addEventListener('pointerleave', ipucuGizle);
    g.addEventListener('focus', () => goster(g));
    g.addEventListener('blur', ipucuGizle);
  }
  // cədvəl görünüşü (açıq rejimdə aqua 3:1-dən aşağıdır — rəqəmlər rəngsiz də oxunsun)
  const cedvel = $('#u-qrafik-cedvel');
  if (cedvel) {
    cedvel.innerHTML = `<table><thead><tr><th>${saatlar ? 'Saat' : 'Tarix'}</th>${SERIYALAR.map(([, ad]) => `<th class="r">${ad}</th>`).join('')}<th class="r">Cəmi</th></tr></thead>
      <tbody>${acarlar.filter((a) => veri.get(a).some(Boolean)).map((a) => { const v = veri.get(a); return `<tr><td class="t">${saatlar ? `${a}:00` : tarixYaz(a)}</td>${v.map((n) => `<td class="r">${n}</td>`).join('')}<td class="r"><b>${v[0] + v[1] + v[2]}</b></td></tr>`; }).join('')}</tbody></table>`;
  }
}
function qrafikYeniden() {
  const q = $('#u-qrafik');
  if (q && QRAFIK) qrafikCiz(q, QRAFIK.seriya, QRAFIK.m);
}

// ================================================================ yan menyu: kamera sistemi və say
function sistemYaz(siqnal, aktiv) {
  const s = $('#sistem');
  if (aktiv !== undefined) $('#nav-say').textContent = aktiv ? reqem(aktiv) : '';
  if (!siqnal) {
    s.innerHTML = '<b><i class="nokte bad"></i>Kamera sistemi</b><span>hələ siqnal gəlməyib</span>';
    return;
  }
  s.innerHTML = `<b><i class="nokte ${siqnal.onlayn ? 'ok' : 'bad'}"></i>Kameralar ${siqnal.onlayn ? 'onlayn' : 'oflayn'}</b>
    <span>${esc(siqnal.kameralar?.map((k) => k.ad).join(', ') || '—')} · son siqnal ${esc(siqnal.alindi.slice(11, 16))}${siqnal.novbe ? ` · növbədə ${reqem(siqnal.novbe)}` : ''}</span>`;
  s.title = `IP ${siqnal.ip} · versiya ${siqnal.versiya || '—'}`;
}

// ================================================================ 1. ÜMUMİ GÖRÜNÜŞ
const U = { m: { nov: 'bugun' }, kamera: '', kat: '', hadiseler: [], kursor: null, tab: 'geciken', cedvel: false };

async function umumiSehife() {
  sehife.innerHTML = `
    <div class="sehife-bas"><div><h1>Ümumi görünüş</h1><p id="u-alt">&nbsp;</p></div>
      <div class="sag"><span class="yenilenib" id="yenilenib"></span>
        <button class="ikon-d" type="button" id="u-yenile" title="Yenilə" aria-label="Yenilə">${IKON.yenile}</button></div></div>
    <div class="filtr-setri" id="u-muddet"></div>
    <div id="u-xeta"></div>
    <div class="cerceve" id="u-cerceve">
      <div class="hero-setka"><section class="kart hero" id="u-hero"></section><div class="gostericiler" id="u-gostericiler"></div></div>
      <div class="esas-setka" id="u-orta">
        <section class="kart">
          <div class="kart-bas"><h2 id="u-qrafik-bas">Keçidlər</h2>
            <div class="sag"><div class="legend">${SERIYALAR.map(([s, ad]) => `<span><i class="acar ${s}"></i>${ad}</span>`).join('')}</div>
              <button class="dugme" type="button" id="u-cedvel-d">Cədvəl</button></div></div>
          <div class="qrafik" id="u-qrafik"></div>
          <div class="cedvel-qab gizli" id="u-qrafik-cedvel"></div>
        </section>
        <section class="kart" id="u-diqqet"></section>
      </div>
      <section class="kart">
        <div class="kart-bas"><h2>Son hadisələr</h2>
          <div class="sag">
            <select id="u-kamera" aria-label="Kamera"><option value="">Bütün kameralar</option></select>
            <select id="u-kat" aria-label="Növ"><option value="">Bütün keçidlər</option><option value="emekdas">Əməkdaşlar</option>
              <option value="telebe">Tələbələr</option><option value="taninmayan">Tanınmayanlar</option></select>
          </div></div>
        <div class="cedvel-qab" id="u-hadiseler"></div>
        <div class="daha gizli" id="u-daha"><button class="dugme" type="button">Daha çox göstər</button></div>
      </section>
    </div>`;
  muddetQur($('#u-muddet'), U.m, ['bugun', 'dunen', 'son7', 'buay', 'araliq'], () => umumiYukle());
  $('#u-yenile').addEventListener('click', () => umumiYukle());
  $('#u-cedvel-d').addEventListener('click', () => {
    U.cedvel = !U.cedvel;
    $('#u-qrafik').classList.toggle('gizli', U.cedvel);
    $('#u-qrafik-cedvel').classList.toggle('gizli', !U.cedvel);
    $('#u-cedvel-d').textContent = U.cedvel ? 'Qrafik' : 'Cədvəl';
  });
  if (U.cedvel) { U.cedvel = false; $('#u-cedvel-d').click(); }
  const kam = $('#u-kamera');
  const kat = $('#u-kat');
  kat.value = U.kat;
  kam.addEventListener('change', () => { U.kamera = kam.value; hadiseYukle(true); });
  kat.addEventListener('change', () => { U.kat = kat.value; hadiseYukle(true); });
  $('#u-daha button').addEventListener('click', () => hadiseYukle(false));
  filtrlerAl().then((f) => {
    kam.insertAdjacentHTML('beforeend', f.kameralar.map((k) => `<option>${esc(k)}</option>`).join(''));
    kam.value = U.kamera;
  }).catch(() => {});
  await umumiYukle();
  taymer = setInterval(() => { if (!document.hidden && U.m.son >= MEN.bugun) umumiYukle(true); }, 15_000);
}

async function umumiYukle(sessiz = false) {
  const m = U.m;
  const cerceve = $('#u-cerceve');
  if (!cerceve) return;
  cerceve.classList.add('gozle');            // yenidən yükləmə: köhnə görüntü solğun qalır, sıçrayış yoxdur
  try {
    const u = await api(`/api/umumi?bas=${m.bas}&son=${m.son}`);
    if (!cerceve.isConnected) return;
    $('#u-xeta').innerHTML = '';
    $('#u-alt').textContent = muddetMetni(m);
    sistemYaz(u.siqnal, u.aktivEmekdas);
    heroYaz(u);
    const gost = [
      ['Ümumi keçid', u.say.cemi, 'bütün kameralar', ''],
      ['Əməkdaş keçidi', u.say.emekdas, `${reqem(u.say.emekdasUnikal)} nəfər`, 's1'],
      ['Tələbə keçidi', u.say.telebe, 'adsız sayılır', 's2'],
      ['Tanınmayan', u.say.taninmayan + u.say.diger, 'bazada olmayan və ya aydın görünməyən', 's3'],
    ];
    $('#u-gostericiler').innerHTML = gost.map(([ad, n, alt, s]) => `<div class="kart gosterici">
      <div class="etiket">${s ? `<i class="acar ${s}"></i>` : ''}${ad}</div><div class="reqem">${reqem(n)}</div>
      <div class="alt">${esc(alt)}</div></div>`).join('');
    $('#u-qrafik-bas').textContent = u.seriya.nov === 'saat' ? 'Keçidlər — saatlara görə' : 'Keçidlər — günlərə görə';
    qrafikCiz($('#u-qrafik'), u.seriya, m);
    diqqetYaz(u.bugun);
    await hadiseYukle(true, sessiz);
    yenilenib();
  } catch (e) {
    $('#u-xeta').innerHTML = xetaHtml(e);
  } finally {
    cerceve.classList.remove('gozle');
  }
}

function heroYaz(u) {
  const b = u.bugun;
  const qab = $('#u-hero');
  if (!b) {          // keçmiş müddət: əsas rəqəm — işə gələn əməkdaş
    qab.innerHTML = `<div class="etiket">İşə gələn əməkdaş</div>
      <div class="reqem">${reqem(u.say.emekdasUnikal)}<small>/ ${reqem(u.aktivEmekdas)}</small></div>
      <div class="alt">${esc(muddetMetni(U.m))} ərzində ən azı bir dəfə keçən</div>`;
    return;
  }
  const faiz = u.aktivEmekdas ? Math.round((b.gelen / u.aktivEmekdas) * 100) : 0;
  qab.innerHTML = `<div class="etiket"><i class="nokte ok"></i>Hazırda binada</div>
    <div class="reqem">${reqem(b.binada)}<small>əməkdaş</small></div>
    <div class="olcu"><div class="olcu-bas"><span>Bu gün gəlib: <b>${reqem(b.gelen)}</b> / ${reqem(u.aktivEmekdas)}</span><b>${faiz}%</b></div>
      <div class="zolaq" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${faiz}" aria-label="Bu günkü davamiyyət"><i data-w="${Math.min(100, faiz)}"></i></div></div>
    <div class="mini-setir"><span><b>${reqem(b.geciken)}</b>gecikib</span>
      ${b.isGunu ? `<span><b>${reqem(b.siyahi.gelmeyen.length)}</b>hələ gəlməyib</span>` : '<span>bu gün iş günü deyil</span>'}</div>`;
  yerlesdir(qab);
}

function diqqetYaz(b) {
  const qab = $('#u-diqqet');
  $('#u-orta').classList.toggle('yan-yox', !b);
  if (!b) {
    qab.innerHTML = `<div class="kart-bas"><h2>Bu gün</h2></div><div class="bos"><b>Seçilmiş müddət bu günü əhatə etmir</b>
      Gecikən və gəlməyənlər "Bu gün" seçiləndə görünür.</div>`;
    return;
  }
  const tablar = [['geciken', 'Gecikənlər'], ...(b.isGunu ? [['gelmeyen', 'Gəlməyənlər']] : []), ['binada', 'Binada']];
  if (!tablar.some(([t]) => t === U.tab)) U.tab = 'geciken';
  const siyahi = b.siyahi[U.tab];
  const deyer = (e) => {
    if (U.tab === 'geciken') return `<span class="nisan warn yox">+${muddetSoz(e.gecikmeSan)}</span><small>${saatQisa(e.gelis)}</small>`;
    if (U.tab === 'binada') return `${saatQisa(e.gelis)}-dan<small>${e.olmamaSan ? `kənarda ${muddetSoz(e.olmamaSan)}` : 'çıxmayıb'}</small>`;
    return '<span class="nisan bad yox">gəlməyib</span>';
  };
  qab.innerHTML = `<div class="kart-bas"><h2>Bu gün diqqət</h2><span class="alt-metn">${tarixUzun(MEN.bugun)}</span></div>
    <div class="tablar" role="tablist">${tablar.map(([t, ad]) => `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === U.tab}"
      class="${t === U.tab ? 'aktiv' : ''}">${ad}<span class="n">${b.siyahi[t].length}</span></button>`).join('')}</div>
    ${siyahi.length ? `<ul class="siyahi">${siyahi.map((e) => `<li><a href="${kartUrl(e.id)}">${avatar(e, 'avatar kicik')}
      <span class="ad"><b>${esc(tamAd(e))}</b><small>${esc([e.vezife, e.sobe].filter(Boolean).join(' · '))}</small></span>
      <span class="deyer">${deyer(e)}</span></a></li>`).join('')}</ul>`
    : `<div class="bos">${{ geciken: 'Bu gün gecikən yoxdur.', gelmeyen: 'Hamı gəlib.', binada: 'Hazırda binada əməkdaş yoxdur.' }[U.tab]}</div>`}`;
  for (const d of $$('[data-tab]', qab)) d.addEventListener('click', () => { U.tab = d.dataset.tab; diqqetYaz(b); });
}

async function hadiseYukle(sifirla, sessiz = false) {
  const m = U.m;
  if (sifirla) U.kursor = null;
  const p = new URLSearchParams({ bas: m.bas, son: m.son, limit: '40' });
  if (U.kamera) p.set('kamera', U.kamera);
  if (U.kat) p.set('kateqoriya', U.kat);
  if (!sifirla && U.kursor) p.set('evvel', U.kursor);
  const qab = $('#u-hadiseler');
  if (!qab) return;
  if (sifirla && !sessiz) qab.innerHTML = '<div class="yuklenir">Yüklənir…</div>';
  try {
    const siyahi = await api(`/api/hadiseler?${p}`);
    U.hadiseler = sifirla ? siyahi : [...U.hadiseler, ...siyahi];
    const son = U.hadiseler.at(-1);
    U.kursor = son ? `${son.tarix}|${son.saat}|${son.no}` : null;
    const coxGun = m.bas !== m.son;
    qab.innerHTML = U.hadiseler.length ? `<table><thead><tr><th>Vaxt</th><th>Şəxs</th><th>İstiqamət</th><th>Kamera</th><th>Şöbə / vəzifə</th></tr></thead>
      <tbody>${U.hadiseler.map((h) => {
        const sexs = h.kateqoriya === 'emekdas' && h.ad
          ? `<a class="adam" href="${kartUrl(h.emekdas_id)}">${avatar({ ...h, id: h.emekdas_id }, 'avatar kicik')}<b>${esc(tamAd(h))}</b></a>`
          : KATEQORIYA[h.kateqoriya] ?? esc(h.kateqoriya);
        return `<tr><td class="t"><b>${esc(h.saat.slice(0, 5))}</b>${coxGun ? `<div class="alt">${tarixYaz(h.tarix)}</div>` : ''}</td>
          <td>${sexs}</td><td>${yon(h.istiqamet)}</td><td><span class="cip">${esc(h.kamera)}</span></td>
          <td>${h.ad ? `${esc(h.sobe)}<div class="alt">${esc(h.vezife)}</div>` : ''}</td></tr>`;
      }).join('')}</tbody></table>`
      : '<div class="bos"><b>Hadisə yoxdur</b>Bu müddətdə və süzgəcdə keçid qeydə alınmayıb.</div>';
    $('#u-daha').classList.toggle('gizli', siyahi.length < 40);
  } catch (e) {
    qab.innerHTML = xetaHtml(e);
  }
}

// ================================================================ 2. ƏMƏKDAŞLAR
const E = { q: '', sobe: '', vezife: '', status: 'hamisi', siyahi: [] };
let FILTR = null;
const filtrlerAl = async () => { if (!FILTR) FILTR = await api('/api/filtrler'); return FILTR; };
const secimler = (siyahi, secili, bos) => `<option value="">${bos}</option>${siyahi.map((v) => `<option${v === secili ? ' selected' : ''}>${esc(v)}</option>`).join('')}`;

const STATUSLAR = [
  ['hamisi', 'Hamısı', () => true],
  ['binada', 'Binadadır', (e) => e.bugun?.binadadir],
  ['cixib', 'Çıxıb', (e) => e.bugun && !e.bugun.binadadir],
  ['gelmeyib', 'Gəlməyib', (e) => !e.bugun && isGunu(MEN.bugun)],
  ['gecikib', 'Gecikib', (e) => e.bugun?.gecikmeSan > 0],
];

async function emekdaslarSehife() {
  sehife.innerHTML = `
    <div class="sehife-bas"><div><h1>Əməkdaşlar</h1><p id="e-alt">&nbsp;</p></div>
      <div class="sag"><span class="yenilenib" id="yenilenib"></span></div></div>
    <div class="filtr-setri">
      <label class="sahe">${IKON.axtar}<input type="search" id="e-q" placeholder="Ad, soyad, ata adı, şöbə, vəzifə…" value="${esc(E.q)}" aria-label="Axtarış"></label>
      <select id="e-sobe" aria-label="Şöbə"><option value="">Bütün şöbələr</option></select>
      <select id="e-vezife" aria-label="Vəzifə"><option value="">Bütün vəzifələr</option></select>
    </div>
    <div class="filtr-setri" id="e-status"></div>
    <section class="kart"><div class="cedvel-qab cerceve" id="e-siyahi"><div class="yuklenir">Yüklənir…</div></div></section>`;
  const q = $('#e-q');
  q.addEventListener('input', debounce(() => { E.q = q.value; emekdaslarYukle(); }));
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; E.q = ''; emekdaslarYukle(); } });
  for (const [id, a] of [['#e-sobe', 'sobe'], ['#e-vezife', 'vezife']]) $(id).addEventListener('change', (e) => { E[a] = e.target.value; emekdaslarYukle(); });
  filtrlerAl().then((f) => {
    $('#e-sobe').innerHTML = secimler(f.sobeler, E.sobe, 'Bütün şöbələr');
    $('#e-vezife').innerHTML = secimler(f.vezifeler, E.vezife, 'Bütün vəzifələr');
  }).catch(() => {});
  await emekdaslarYukle();
  if (!matchMedia('(max-width: 900px)').matches) q.focus();
}

async function emekdaslarYukle() {
  const p = new URLSearchParams();
  for (const k of ['q', 'sobe', 'vezife']) if (E[k]) p.set(k, E[k]);
  const qab = $('#e-siyahi');
  qab.classList.add('gozle');
  try {
    E.siyahi = await api(`/api/emekdaslar?${p}`);
    if (!qab.isConnected) return;
    emekdaslarCiz();
    yenilenib();
  } catch (e) {
    qab.innerHTML = xetaHtml(e);
  } finally {
    qab.classList.remove('gozle');
  }
}

function buGunHucre(e) {
  const b = e.bugun;
  if (!b) return isGunu(MEN.bugun) ? '<span class="nisan bad">Gəlməyib</span>' : '<span class="alt-metn">istirahət günü</span>';
  const gec = b.gecikmeSan > 0 ? ` <span class="nisan warn yox">+${muddetSoz(b.gecikmeSan)}</span>` : '';
  if (b.binadadir) return `<span class="nisan ok">Binadadır</span> <span class="alt-metn">${saatQisa(b.gelis)}-dan</span>${gec}`;
  return `<span class="nisan boz">Çıxıb</span> <span class="alt-metn">${saatQisa(b.gelis)}–${saatQisa(b.cixis)}</span>${gec}`;
}

function emekdaslarCiz() {
  const sayi = Object.fromEntries(STATUSLAR.map(([k, , f]) => [k, E.siyahi.filter(f).length]));
  $('#e-status').innerHTML = `<div class="seq" role="group" aria-label="Bu günkü vəziyyət">${STATUSLAR
    .filter(([k]) => k !== 'gelmeyib' || isGunu(MEN.bugun))
    .map(([k, ad]) => `<button type="button" data-st="${k}" class="${E.status === k ? 'aktiv' : ''}" aria-pressed="${E.status === k}">${ad}<span class="n">${sayi[k]}</span></button>`).join('')}</div>`;
  for (const d of $$('[data-st]')) d.addEventListener('click', () => { E.status = d.dataset.st; emekdaslarCiz(); });
  const f = STATUSLAR.find(([k]) => k === E.status)[2];
  const siyahi = E.siyahi.filter(f);
  $('#e-alt').textContent = `${reqem(E.siyahi.length)} əməkdaş${E.q || E.sobe || E.vezife ? ' (süzülmüş)' : ''} · bu gün binada ${reqem(sayi.binada)}`;
  const qab = $('#e-siyahi');
  qab.innerHTML = siyahi.length ? `<table><thead><tr><th>Əməkdaş</th><th>Şöbə</th><th>Vəzifə</th><th>Bu gün</th></tr></thead>
    <tbody>${siyahi.map((e) => `<tr class="klik" data-id="${esc(e.id)}" tabindex="0">
      <td><div class="adam">${avatar(e)}<div><b>${esc(tamAd(e))}</b><span class="alt">${esc(e.ata ? `ata adı: ${e.ata}` : '')}</span></div></div></td>
      <td>${esc(e.sobe)}</td><td>${esc(e.vezife)}</td><td>${buGunHucre(e)}</td></tr>`).join('')}</tbody></table>`
    : `<div class="bos">${E.q ? `<b>"${esc(E.q)}" üzrə əməkdaş tapılmadı</b>Yazılışı yoxlayın: "Eli" = "Əli", "huseyn" = "Hüseyn".`
      : E.siyahi.length ? '<b>Bu vəziyyətdə əməkdaş yoxdur</b>' : '<b>Əməkdaş yoxdur</b>Kamera sistemi əməkdaş siyahısını göndərəndən sonra burada görünəcək.'}</div>`;
  for (const tr of $$('tr[data-id]', qab)) {
    const ac = () => { location.hash = kartUrl(tr.dataset.id); };
    tr.addEventListener('click', ac);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ac(); });
  }
}

// ---------------------------------------------------------------- əməkdaş kartı
const T = { m: { nov: 'son7' } };

function gunCedveli(setirler, { xett = true } = {}) {
  if (!setirler.length) return '<div class="bos"><b>Qeyd yoxdur</b>Bu müddətdə keçid qeydə alınmayıb.</div>';
  return `<table><thead><tr><th>Tarix</th><th class="r">Gəliş</th><th class="r">Çıxış</th>${xett ? '<th>Günün xətti</th>' : ''}
    <th class="r">İşdə olma</th><th>Kənarda olma</th><th>Qeyd</th></tr></thead>
    <tbody>${setirler.map((s) => {
    const tarix = `<td class="t"><b>${tarixYaz(s.tarix)}</b> <span class="alt">${hefteQisa(s.tarix)}</span></td>`;
    if (s.veziyyet === 'gelmeyib') return `<tr>${tarix}<td colspan="${xett ? 6 : 5}"><span class="nisan bad">Gəlməyib</span></td></tr>`;
    if (s.veziyyet === 'istirahet') return `<tr>${tarix}<td colspan="${xett ? 6 : 5}"><span class="nisan boz">İstirahət günü</span></td></tr>`;
    const gec = s.gecikmeSan > 0 ? `<div><span class="nisan warn yox">+${muddetSoz(s.gecikmeSan)}</span></div>` : '';
    const cix = s.cixis ? saatQisa(s.cixis) : s.binadadir ? '<span class="nisan ok">binada</span>' : '<span class="alt-metn">—</span>';
    const qeyd = [...s.qeydler, s.erkenCixisSan > 0 && s.cixis ? `${muddetSoz(s.erkenCixisSan)} erkən çıxıb` : ''].filter(Boolean);
    return `<tr>${tarix}<td class="r">${saatQisa(s.gelis)}${gec}</td><td class="r">${cix}</td>
      ${xett ? `<td>${gunXetti(s, { kicik: true, indi: s.tarix === MEN.bugun ? indiSaat() : null })}</td>` : ''}
      <td class="r"><b>${muddetSoz(s.isdeSan)}</b></td><td>${kenarHucre(s)}</td>
      <td class="genis"><span class="alt-metn">${qeyd.map(esc).join('; ')}</span></td></tr>`;
  }).join('')}</tbody></table>`;
}

function xulaseSetri(x) {
  return `<div class="gosterici-setri">
    ${[['Gəldiyi gün', reqem(x.gelenGun)], ['Gəlmədiyi iş günü', reqem(x.gelmeyenGun)], ['Cəmi işdə', muddetSoz(x.isdeSan)],
    ['Cəmi kənarda', muddetSoz(x.olmamaSan)], ['Gecikmə', x.gecikmeSayi ? `${x.gecikmeSayi} dəfə` : 'yoxdur'], ['Orta gəliş', x.ortaGelis ?? '—']]
    .map(([a, d]) => `<div class="gosterici"><div class="etiket">${a}</div><div class="reqem">${d}</div></div>`).join('')}</div>`;
}

async function emekdasSehife(id) {
  sehife.innerHTML = '<div class="yuklenir">Yüklənir…</div>';
  let e;
  try {
    e = await api(`/api/emekdaslar/${encodeURIComponent(id)}`);
  } catch (x) {
    sehife.innerHTML = `<a class="geri" href="#/emekdaslar">${IKON.geri}Əməkdaşlar</a>${xetaHtml(x)}`;
    return;
  }
  const b = e.bugun;
  const indi = indiSaat();
  const status = b.binadadir ? '<span class="nisan ok">Hazırda binadadır</span>'
    : b.gelis ? `<span class="nisan boz">Çıxıb ${saatQisa(b.cixis || b.sonGorunme)}</span>`
      : b.veziyyet === 'istirahet' ? '<span class="nisan boz">İstirahət günü</span>' : '<span class="nisan bad">Bu gün gəlməyib</span>';
  sehife.innerHTML = `
    <a class="geri" href="#/emekdaslar">${IKON.geri}Əməkdaşlar</a>
    <section class="kart">
      <div class="profil">
        ${e.sekil_var ? `<img class="foto" src="${sekilUrl(e.id)}" alt="${esc(tamAd(e))}">` : `<div class="foto" aria-hidden="true">${esc(basHerf(e))}</div>`}
        <div><h2>${esc(tamAd(e))}</h2>
          <div class="vezife">${esc([e.vezife, e.sobe].filter(Boolean).join(' · '))}${e.ata ? ` · ata adı: ${esc(e.ata)}` : ''}</div>
          <div class="nisanlar">${status}${b.gecikmeSan > 0 ? `<span class="nisan warn">${muddetSoz(b.gecikmeSan)} gecikib</span>` : ''}
            ${e.aktiv ? '' : '<span class="nisan boz">kamera bazasında deyil</span>'}</div></div>
      </div>
      <div class="bugun-setri">
        <div><div class="etiket">Bu gün gəliş</div><div class="deyer">${saatQisa(b.gelis)}</div></div>
        <div><div class="etiket">Çıxış</div><div class="deyer">${b.cixis ? saatQisa(b.cixis) : b.binadadir ? '<small>hələ binadadır</small>' : '—'}</div></div>
        <div><div class="etiket">İşdə olma</div><div class="deyer">${muddetSoz(b.isdeSan)}</div></div>
        <div><div class="etiket">Kənarda olma</div><div class="deyer">${b.gelis ? muddetSoz(b.olmamaSan) : '—'}
          ${b.bosluqlar.length ? `<small>${b.bosluqlar.length} dəfə</small>` : ''}</div></div>
        <div><div class="etiket">İş qrafiki</div><div class="deyer">${esc(MEN.isBaslama)}–${esc(MEN.isBitme)}</div></div>
      </div>
    </section>
    <br>
    <div class="yan-yana">
      <section class="kart">
        <div class="kart-bas"><h2>Günün zaman xətti</h2><span class="alt-metn">${tarixUzun(MEN.bugun)}</span></div>
        <div class="xett-qab">${gunXetti({ ...b, tarix: MEN.bugun }, { indi, aBas: 7, aSon: 20 })}</div>
        <div class="xett-legend"><span><i class="l-ic"></i>Binada</span><span><i class="l-kenar"></i>Kənarda</span><span><i class="l-plan"></i>İş qrafiki</span></div>
        ${b.qeydler.length ? `<div class="qeyd-qutu">${b.qeydler.map(esc).join('; ')}</div>` : ''}
      </section>
      <section class="kart">
        <div class="kart-bas"><h2>Kənarda olduğu vaxt</h2><span class="alt-metn">gün ərzində çıxıb-qayıtma</span></div>
        ${b.bosluqlar.length ? `<ul class="kenar-siyahi">${b.bosluqlar.map((x) => `<li><span class="saatlar">${saatQisa(x.cixis)}</span>
          <span class="ox">→</span><span class="saatlar">${saatQisa(x.qayitma)}</span><span class="nisan warn yox muddet">${muddetSoz(x.san)}</span></li>`).join('')}</ul>
          <div class="cem"><span>Cəmi kənarda</span><span>${muddetSoz(b.olmamaSan)}</span></div>`
    : `<div class="bos">${b.gelis ? '<b>Gün ərzində binadan çıxmayıb</b>' : 'Bu gün keçid yoxdur.'}</div>`}
      </section>
    </div>
    <section class="kart">
      <div class="kart-bas"><h2>Bu günün keçidləri</h2><span class="alt-metn">${b.hadiseler.length} keçid</span></div>
      ${b.hadiseler.length ? `<ul class="kecidler">${b.hadiseler.map((h) => `<li><span class="saat">${esc(h.saat)}</span>${yon(h.istiqamet)}<span class="cip">${esc(h.kamera)}</span></li>`).join('')}</ul>`
    : '<div class="bos">Bu gün keçid yoxdur.</div>'}
    </section>
    <br>
    <section class="kart">
      <div class="kart-bas"><h2>Tarixçə</h2>
        <div class="sag"><div class="sag" id="t-muddet"></div>
          <button class="dugme excel" type="button" id="t-excel">${IKON.excel}Excel</button></div></div>
      <div class="kart-ici" id="t-xulase"></div>
      <div class="cedvel-qab cerceve" id="t-cedvel"></div>
    </section>`;
  yerlesdir(sehife);
  const yukle = async () => {
    const m = T.m;
    const qab = $('#t-cedvel');
    qab.classList.add('gozle');
    try {
      const t = await api(`/api/emekdaslar/${encodeURIComponent(id)}/tarixce?bas=${m.bas}&son=${m.son}`);
      $('#t-xulase').innerHTML = `<div class="alt-metn">${muddetMetni(m)}</div><br>${xulaseSetri(t.xulase)}`;
      qab.innerHTML = gunCedveli(t.setirler);
      yerlesdir(qab);
    } catch (x) {
      qab.innerHTML = xetaHtml(x);
    } finally {
      qab.classList.remove('gozle');
    }
  };
  muddetQur($('#t-muddet'), T.m, ['son7', 'buay', 'kecenay', 'araliq'], yukle);
  $('#t-excel').addEventListener('click', (ev) => excelEndir(new URLSearchParams({ bas: T.m.bas, son: T.m.son, emekdas: id }), ev.currentTarget));
  await yukle();
}

// ================================================================ 3. HESABAT
const H = { m: { nov: 'ay' }, q: '', sobe: '', vezife: '', sira: 'soyad', artan: true, xulase: [] };

function hesabatParam(emekdas) {
  const p = new URLSearchParams({ bas: H.m.bas, son: H.m.son });
  for (const k of ['q', 'sobe', 'vezife']) if (H[k]) p.set(k, H[k]);
  if (emekdas) p.set('emekdas', emekdas);
  return p;
}
const davamiyyet = (x) => { const c = x.gelenGun + x.gelmeyenGun; return c ? Math.round((x.gelenGun / c) * 100) : null; };

async function hesabatSehife() {
  sehife.innerHTML = `
    <div class="sehife-bas"><div><h1>Hesabat</h1><p>Gəliş, çıxış, işdə və kənarda olma — seçilmiş müddət və süzgəc üzrə.</p></div>
      <div class="sag"><button class="dugme excel" type="button" id="h-excel">${IKON.excel}Excel-ə çıxar</button></div></div>
    <div class="filtr-setri" id="h-muddet"></div>
    <div class="filtr-setri">
      <label class="sahe">${IKON.axtar}<input type="search" id="h-q" placeholder="Əməkdaş axtar…" value="${esc(H.q)}" aria-label="Axtarış"></label>
      <select id="h-sobe" aria-label="Şöbə"><option value="">Bütün şöbələr</option></select>
      <select id="h-vezife" aria-label="Vəzifə"><option value="">Bütün vəzifələr</option></select>
    </div>
    <div id="h-xulase"></div>
    <section class="kart"><div class="kart-bas"><h2 id="h-bas">Əməkdaşlar üzrə</h2><span class="alt-metn" id="h-izah"></span></div>
      <div class="cedvel-qab cerceve" id="h-cedvel"></div></section>`;
  muddetQur($('#h-muddet'), H.m, ['gun', 'ay', 'son7', 'araliq'], hesabatYukle);
  const q = $('#h-q');
  q.addEventListener('input', debounce(() => { H.q = q.value; hesabatYukle(); }));
  for (const [id, a] of [['#h-sobe', 'sobe'], ['#h-vezife', 'vezife']]) $(id).addEventListener('change', (e) => { H[a] = e.target.value; hesabatYukle(); });
  $('#h-excel').addEventListener('click', (e) => excelEndir(hesabatParam(), e.currentTarget));
  filtrlerAl().then((f) => {
    $('#h-sobe').innerHTML = secimler(f.sobeler, H.sobe, 'Bütün şöbələr');
    $('#h-vezife').innerHTML = secimler(f.vezifeler, H.vezife, 'Bütün vəzifələr');
  }).catch(() => {});
  await hesabatYukle();
}

async function hesabatYukle() {
  const qab = $('#h-cedvel');
  if (!qab) return;
  const f = [H.sobe, H.vezife, H.q && `"${H.q}"`].filter(Boolean);
  $('#h-izah').textContent = `${muddetMetni(H.m)} · Excel: ${f.length ? f.join(', ') : 'bütün aktiv əməkdaşlar'}`;
  qab.classList.add('gozle');
  try {
    const h = await api(`/api/hesabat?${hesabatParam()}`);
    if (!qab.isConnected) return;
    H.xulase = h.xulase;
    const n = h.xulase.length;
    const faizler = h.xulase.map(davamiyyet).filter((x) => x !== null);
    const cem = (k) => h.xulase.reduce((a, x) => a + (x[k] || 0), 0);
    $('#h-xulase').innerHTML = `<div class="gosterici-setri">${[
      ['Əməkdaş', reqem(n)],
      ['Orta davamiyyət', faizler.length ? `${Math.round(faizler.reduce((a, b) => a + b, 0) / faizler.length)}%` : '—'],
      ['Gəlmədiyi iş günü (cəmi)', reqem(cem('gelmeyenGun'))],
      ['Gecikmə (cəmi)', `${reqem(cem('gecikmeSayi'))} dəfə`],
      ['Kənarda olma (cəmi)', muddetSoz(cem('olmamaSan'))],
    ].map(([a, d]) => `<div class="gosterici kart"><div class="etiket">${a}</div><div class="reqem">${d}</div></div>`).join('')}</div><br>`;
    $('#h-bas').textContent = `Əməkdaşlar üzrə — ${n}`;
    hesabatCedvel();
  } catch (e) {
    qab.innerHTML = xetaHtml(e);
  } finally {
    qab.classList.remove('gozle');
  }
}

const SUTUNLAR = [
  ['soyad', 'Əməkdaş', (x) => `${x.soyad} ${x.ad}`],
  ['sobe', 'Şöbə / vəzifə', (x) => x.sobe],
  ['davamiyyet', 'Davamiyyət', davamiyyet],
  ['gelmeyenGun', 'Gəlmədiyi', (x) => x.gelmeyenGun],
  ['isdeSan', 'Cəmi işdə', (x) => x.isdeSan],
  ['olmamaSan', 'Kənarda', (x) => x.olmamaSan],
  ['gecikmeSayi', 'Gecikmə', (x) => x.gecikmeSayi],
  ['ortaGelis', 'Orta gəliş', (x) => x.ortaGelis ?? '99'],
];
const AZ = new Intl.Collator('az', { sensitivity: 'base', numeric: true });

function hesabatCedvel() {
  const qab = $('#h-cedvel');
  const [, , acar] = SUTUNLAR.find(([k]) => k === H.sira);
  const siyahi = [...H.xulase].sort((a, b) => {
    const [x, y] = [acar(a), acar(b)];
    const f = typeof x === 'number' || typeof y === 'number' ? (x ?? -1) - (y ?? -1) : AZ.compare(String(x), String(y));
    return H.artan ? f : -f;
  });
  qab.innerHTML = siyahi.length ? `<table><thead><tr>${SUTUNLAR.map(([k, ad], i) => `<th class="siralanan${H.sira === k ? ' siralanib' : ''}${i > 1 ? ' r' : ''}"
      data-sira="${k}" tabindex="0" aria-sort="${H.sira === k ? (H.artan ? 'ascending' : 'descending') : 'none'}">${ad}<span class="ox">${H.sira === k && !H.artan ? '↓' : '↑'}</span></th>`).join('')}</tr></thead>
    <tbody>${siyahi.map((x) => {
    const d = davamiyyet(x);
    return `<tr class="klik" data-id="${esc(x.id)}" tabindex="0">
      <td><b>${esc(`${x.soyad} ${x.ad}`)}</b><div class="alt">${esc(x.ata)}</div></td>
      <td>${esc(x.sobe)}<div class="alt">${esc(x.vezife)}</div></td>
      <td class="r">${d === null ? '—' : `<div class="olcu"><div class="olcu-bas"><span>${x.gelenGun} gün</span><b>${d}%</b></div>
        <div class="zolaq"><i data-w="${d}"></i></div></div>`}</td>
      <td class="r">${x.gelmeyenGun ? `<span class="nisan bad yox">${x.gelmeyenGun} gün</span>` : '<span class="alt-metn">0</span>'}</td>
      <td class="r"><b>${muddetSoz(x.isdeSan)}</b></td>
      <td class="r">${muddetSoz(x.olmamaSan)}</td>
      <td class="r">${x.gecikmeSayi ? `${x.gecikmeSayi} dəfə<div class="alt">${muddetSoz(x.gecikmeSan)}</div>` : '<span class="alt-metn">—</span>'}</td>
      <td class="r">${x.ortaGelis ?? '—'}</td></tr>`;
  }).join('')}</tbody></table>`
    : '<div class="bos"><b>Süzgəcə uyğun əməkdaş yoxdur</b></div>';
  yerlesdir(qab);
  for (const th of $$('th[data-sira]', qab)) {
    const sira = () => {
      if (H.sira === th.dataset.sira) H.artan = !H.artan;
      else { H.sira = th.dataset.sira; H.artan = !['davamiyyet', 'gelmeyenGun', 'isdeSan', 'olmamaSan', 'gecikmeSayi'].includes(H.sira); }
      hesabatCedvel();
    };
    th.addEventListener('click', sira);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter') sira(); });
  }
  for (const tr of $$('tr[data-id]', qab)) {
    const ac = () => cekmeceAc(tr.dataset.id);
    tr.addEventListener('click', ac);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ac(); });
  }
}

// ---------------------------------------------------------------- yan pəncərə: seçilmiş əməkdaşın günləri
let cekmeceQaytar = null;
async function cekmeceAc(id) {
  const x = H.xulase.find((e) => e.id === id);
  const c = $('#cekmece');
  const o = $('#ortu');
  cekmeceQaytar = document.activeElement;
  c.innerHTML = `<div class="cekmece-bas">${avatar(x)}<div><h2 id="cekmece-bas">${esc(tamAd(x))}</h2>
      <span class="alt-metn">${esc([x.vezife, x.sobe].filter(Boolean).join(' · '))} · ${muddetMetni(H.m)}</span></div>
    <div class="sag"><a class="dugme" href="${kartUrl(id)}" id="c-kart">${IKON.karta}Kartı aç</a>
      <button class="dugme excel" type="button" id="c-excel">${IKON.excel}Excel</button>
      <button class="ikon-d" type="button" id="c-bagla" aria-label="Bağla">${IKON.bagla}</button></div></div>
    <div class="cekmece-ici">${xulaseSetri(x)}<section class="kart"><div class="cedvel-qab" id="c-cedvel"><div class="yuklenir">Yüklənir…</div></div></section></div>`;
  c.classList.remove('gizli');
  o.classList.remove('gizli');
  requestAnimationFrame(() => { c.classList.add('acik'); o.classList.add('acik'); });
  $('#c-bagla').focus();
  $('#c-bagla').addEventListener('click', cekmeceBagla);
  $('#c-kart').addEventListener('click', () => cekmeceBagla(false));
  $('#c-excel').addEventListener('click', (e) => excelEndir(hesabatParam(id), e.currentTarget));
  try {
    const h = await api(`/api/hesabat?${hesabatParam(id)}`);
    $('#c-cedvel').innerHTML = gunCedveli([...h.setirler].reverse());
    yerlesdir(c);
  } catch (e) {
    $('#c-cedvel').innerHTML = xetaHtml(e);
  }
}
function cekmeceBagla(fokus = true) {
  const c = $('#cekmece');
  const o = $('#ortu');
  if (c.classList.contains('gizli')) return;
  c.classList.remove('acik');
  o.classList.remove('acik');
  setTimeout(() => { c.classList.add('gizli'); o.classList.add('gizli'); }, 220);
  if (fokus !== false && cekmeceQaytar?.isConnected) cekmeceQaytar.focus();
}
$('#ortu').addEventListener('click', cekmeceBagla);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cekmeceBagla(); });

// ================================================================ yönləndirmə
async function yonlendir() {
  clearInterval(taymer);
  taymer = null;
  ipucuGizle();
  cekmeceBagla(false);
  const [, yol = 'umumi', param] = (location.hash || '#/umumi').split('/');
  const nav = yol === 'emekdas' ? 'emekdaslar' : yol;
  for (const a of $$('.nav a')) {
    a.classList.toggle('aktiv', a.dataset.nav === nav);
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  if (yol === 'emekdaslar') return emekdaslarSehife();
  if (yol === 'emekdas' && param) return emekdasSehife(decodeURIComponent(param));
  if (yol === 'hesabat') return hesabatSehife();
  if (location.hash && location.hash !== '#/umumi') history.replaceState(null, '', '#/umumi');
  return umumiSehife();
}

async function sistemYenile() {
  try {
    const u = await api(`/api/umumi?bas=${MEN.bugun}&son=${MEN.bugun}`);
    sistemYaz(u.siqnal, u.aktivEmekdas);
  } catch { /* növbəti dəfə */ }
}

async function basla() {
  try {
    MEN = await api('/api/men');
  } catch {
    return;
  }
  $('#istifadeci').textContent = MEN.ad;
  $('#ist-herf').textContent = MEN.ad.slice(0, 2).toUpperCase();
  $('#ist-rol').textContent = MEN.rol === 'admin' ? 'administrator' : 'HR';
  temaQur();
  $('#cixis').addEventListener('click', async () => {
    await api('/api/cixis', { method: 'POST' }).catch(() => {});
    location.replace('/giris');
  });
  window.addEventListener('hashchange', yonlendir);
  window.addEventListener('resize', debounce(qrafikYeniden, 200));
  setInterval(() => { if (!document.hidden) sistemYenile(); }, 60_000);
  sistemYenile();
  yonlendir();
}

basla();
