// AzTU HR paneli — brauzer tərəfi (çərçivəsiz, birbaşa DOM). Səhifələr: #/umumi, #/emekdaslar, #/emekdas/<id>, #/hesabat.
// Təhlükəsizlik: serverdən gələn bütün mətn esc() ilə yazılır (ad, şöbə və s. HTML kimi işlənmir).

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const sehife = $('#sehife');

let MEN = null;
let taymer = null;

// ---------------------------------------------------------------- server
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

// ---------------------------------------------------------------- formatlar
const pad = (x) => String(x).padStart(2, '0');
const tarixObj = (t) => new Date(`${t}T00:00:00Z`);
const tarixStr = (d) => d.toISOString().slice(0, 10);
const gunEkle = (t, n) => { const d = tarixObj(t); d.setUTCDate(d.getUTCDate() + n); return tarixStr(d); };
const ayBasi = (t) => `${t.slice(0, 7)}-01`;
const ayinSonu = (ay) => { const d = tarixObj(`${ay}-01`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return tarixStr(d); };
const AYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const tarixYaz = (t) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : '—');
const tarixUzun = (t) => `${Number(t.slice(8, 10))} ${AYLAR[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
const saatQisa = (s) => (s ? s.slice(0, 5) : '—');
const muddet = (san) => {
  if (san === null || san === undefined) return '—';
  const d = Math.round(san / 60);
  return `${Math.floor(d / 60)}:${pad(d % 60)}`;
};
const reqem = (n) => Number(n || 0).toLocaleString('az-AZ');
const basHerf = (e) => `${(e.ad || '?')[0]}${(e.soyad || '')[0] || ''}`.toUpperCase();
const sekilUrl = (id) => `/api/emekdaslar/${encodeURIComponent(id)}/sekil`;
const avatar = (e, sinif = 'avatar') => (e.sekil_var
  ? `<img class="${sinif}" src="${sekilUrl(e.id)}" alt="" loading="lazy">`
  : `<div class="${sinif}">${esc(basHerf(e))}</div>`);
const tamAd = (e) => `${e.ad ?? ''} ${e.soyad ?? ''}`.trim();
const ISTIQAMET = { giris: '<span class="nisan ok">Giriş</span>', cixis: '<span class="nisan boz">Çıxış</span>' };
const KATEQORIYA = {
  emekdas: '<span class="nisan info">Əməkdaş</span>', telebe: '<span class="nisan boz">Tələbə</span>',
  taninmayan: '<span class="nisan warn">Tanınmayan</span>', diger: '<span class="nisan boz">Digər</span>',
};
const IKON_EXCEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 12l5 6M14 12l-5 6"/></svg>';
const IKON_AXTAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

function gecikmeYaz(san) {
  return san > 0 ? `<span class="nisan warn">${muddet(san)} gecikmə</span>` : '';
}

/** Bir günün vəziyyət nişanı (cədvəllərdə) */
function veziyyetNisan(s) {
  if (s.veziyyet === 'gelmeyib') return '<span class="nisan bad">Gəlməyib</span>';
  if (s.veziyyet === 'istirahet') return '<span class="nisan boz">İstirahət</span>';
  if (s.binadadir) return '<span class="nisan ok">Binadadır</span>';
  return '';
}

function qeydYaz(s) {
  const q = [...(s.qeydler || [])];
  for (const b of s.bosluqlar || []) q.push(`${saatQisa(b.cixis)}–${saatQisa(b.qayitma)} kənarda`);
  return q.map(esc).join('; ');
}

function debounce(f, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); };
}

function xetaGoster(el, e) {
  el.innerHTML = `<div class="xeta-qutu">${esc(e.message || e)}</div>`;
}

// ---------------------------------------------------------------- müddət seçicisi
const MUDDET_ADLARI = {
  bugun: 'Bu gün', dunen: 'Dünən', son7: 'Son 7 gün', buay: 'Bu ay', kecenay: 'Keçən ay',
  gun: 'Gün', ay: 'Ay', araliq: 'Aralıq',
};

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

function muddetHtml(m, secimler) {
  const dugmeler = secimler.map((n) => `<button type="button" data-muddet="${n}" class="${m.nov === n ? 'aktiv' : ''}">${MUDDET_ADLARI[n]}</button>`).join('');
  let elave = '';
  if (m.nov === 'gun') elave = `<input type="date" data-m="gun" value="${m.gun}" max="${MEN.bugun}" aria-label="Gün">`;
  if (m.nov === 'ay') elave = `<input type="month" data-m="ay" value="${m.ay}" max="${MEN.bugun.slice(0, 7)}" aria-label="Ay">`;
  if (m.nov === 'araliq') {
    elave = `<input type="date" data-m="araliqBas" value="${m.araliqBas}" max="${MEN.bugun}" aria-label="Başlanğıc">
      <span class="say-qeyd">—</span><input type="date" data-m="araliqSon" value="${m.araliqSon}" max="${MEN.bugun}" aria-label="Son">`;
  }
  return `<div class="seqment" role="group" aria-label="Müddət">${dugmeler}</div>${elave}`;
}

/** Müddət seçicisini qabda çəkir; dəyişəndə deyisdi() çağırılır */
function muddetQur(qab, m, secimler, deyisdi) {
  const ciz = () => {
    muddetHesabla(m);
    qab.innerHTML = muddetHtml(m, secimler);
    for (const d of $$('[data-muddet]', qab)) {
      d.addEventListener('click', () => { m.nov = d.dataset.muddet; ciz(); deyisdi(); });
    }
    for (const i of $$('[data-m]', qab)) {
      i.addEventListener('change', () => { if (i.value) { m[i.dataset.m] = i.value; muddetHesabla(m); deyisdi(); } });
    }
  };
  ciz();
}

const muddetMetni = (m) => (m.bas === m.son ? tarixUzun(m.bas) : `${tarixYaz(m.bas)} — ${tarixYaz(m.son)}`);

// ---------------------------------------------------------------- qrafik (SVG, kitabxanasız)
function qrafikCiz(qab, seriya, m) {
  const saatlar = seriya.nov === 'saat';
  const acarlar = saatlar ? Array.from({ length: 24 }, (_, i) => pad(i)) : [];
  if (!saatlar) for (let t = m.bas; t <= m.son; t = gunEkle(t, 1)) acarlar.push(t);
  const xerite = new Map(acarlar.map((a) => [a, { a: 0, b: 0 }]));
  for (const s of seriya.setirler) {
    const x = xerite.get(s.acar);
    if (x) x[s.kateqoriya === 'emekdas' ? 'a' : 'b'] += s.n;
  }
  const W = Math.max(320, qab.clientWidth || 800);
  const H = 220;
  const sol = 36;
  const alt = 22;
  const ust = 10;
  const maks = Math.max(1, ...[...xerite.values()].map((x) => x.a + x.b));
  const addim = Math.ceil(maks / 4 / 5) * 5 || 1;
  const tavan = addim * 4;
  const en = (W - sol - 8) / acarlar.length;
  const y = (v) => ust + (H - ust - alt) * (1 - v / tavan);
  let svg = '';
  for (let i = 0; i <= 4; i += 1) {
    const v = addim * i;
    svg += `<line class="ox" x1="${sol}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}"/><text x="${sol - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const hersi = Math.ceil(acarlar.length / Math.floor((W - sol) / 46));
  acarlar.forEach((a, i) => {
    const x = xerite.get(a);
    const bx = sol + i * en + en * 0.18;
    const bw = Math.max(2, en * 0.64);
    const ad = saatlar ? `${a}:00–${a}:59` : tarixYaz(a);
    const ipucu = `<title>${ad}: əməkdaş ${x.a}, digər ${x.b}</title>`;
    if (x.a) svg += `<rect class="a" x="${bx}" y="${y(x.a)}" width="${bw}" height="${y(0) - y(x.a)}" rx="2">${ipucu}</rect>`;
    if (x.b) svg += `<rect class="b" x="${bx}" y="${y(x.a + x.b)}" width="${bw}" height="${y(x.a) - y(x.a + x.b)}" rx="2">${ipucu}</rect>`;
    if (i % hersi === 0) {
      const yazi = saatlar ? a : `${a.slice(8)}.${a.slice(5, 7)}`;
      svg += `<text x="${sol + i * en + en / 2}" y="${H - 6}" text-anchor="middle">${yazi}</text>`;
    }
  });
  qab.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Keçidlərin paylanması">${svg}</svg>`;
}

// ================================================================ 1. ÜMUMİ GÖRÜNÜŞ
const U = { m: { nov: 'bugun' }, kamera: '', kat: '', hadiseler: [], sonNo: null, bitdi: false, filtr: null };

async function umumiSehife() {
  sehife.innerHTML = `
    <div class="bas"><div><h1>Ümumi görünüş</h1><p id="u-alt"></p></div><div class="status" id="u-status"></div></div>
    <div class="filtr" id="u-muddet"></div><br>
    <div id="u-xeta"></div>
    <div class="kpi" id="u-kpi"></div>
    <div class="kpi kicik" id="u-bugun"></div>
    <div class="ikili">
      <section class="kart">
        <div class="kart-bas"><h2 id="u-qrafik-bas">Keçidlər</h2>
          <div class="legend"><span class="a">Əməkdaş</span><span class="b">Tələbə və digər</span></div></div>
        <div class="kart-ici qrafik" id="u-qrafik"></div>
      </section>
      <section class="kart">
        <div class="kart-bas"><h2>Son hadisələr</h2>
          <div class="filtr">
            <select id="u-kamera" aria-label="Kamera"><option value="">Bütün kameralar</option></select>
            <select id="u-kat" aria-label="Növ">
              <option value="">Bütün keçidlər</option><option value="emekdas">Əməkdaşlar</option>
              <option value="telebe">Tələbələr</option><option value="taninmayan">Tanınmayanlar</option>
            </select>
          </div></div>
        <div class="cedvel-qab" id="u-hadiseler"></div>
        <div class="daha gizli" id="u-daha"><button class="dugme" type="button">Daha çox göstər</button></div>
      </section>
    </div>`;
  muddetQur($('#u-muddet'), U.m, ['bugun', 'dunen', 'son7', 'buay', 'araliq'], () => umumiYukle(true));
  const kam = $('#u-kamera');
  const kat = $('#u-kat');
  kat.value = U.kat;
  kam.addEventListener('change', () => { U.kamera = kam.value; hadiseYukle(true); });
  kat.addEventListener('change', () => { U.kat = kat.value; hadiseYukle(true); });
  $('#u-daha button').addEventListener('click', () => hadiseYukle(false));
  try {
    U.filtr = await api('/api/filtrler');
    kam.insertAdjacentHTML('beforeend', U.filtr.kameralar.map((k) => `<option>${esc(k)}</option>`).join(''));
    kam.value = U.kamera;
  } catch { /* filtr olmadan da işləyir */ }
  await umumiYukle(true);
  taymer = setInterval(() => {
    if (!document.hidden && U.m.son >= MEN.bugun) umumiYukle(false);
  }, 15_000);
}

async function umumiYukle(tam) {
  const m = U.m;
  try {
    const u = await api(`/api/umumi?bas=${m.bas}&son=${m.son}`);
    $('#u-xeta').innerHTML = '';
    $('#u-alt').textContent = muddetMetni(m);
    const s = u.siqnal;
    const st = $('#u-status');
    if (!s) {
      st.className = 'status bad';
      st.innerHTML = '<i></i>Kamera sistemindən hələ siqnal gəlməyib';
    } else {
      st.className = `status ${s.onlayn ? 'ok' : 'bad'}`;
      st.innerHTML = `<i></i>Kamera sistemi ${s.onlayn ? 'onlayn' : 'oflayn'} · son siqnal ${esc(s.alindi.slice(11, 16))}`
        + `${s.kameralar?.length ? ` · ${s.kameralar.map((k) => esc(k.ad)).join(', ')}` : ''}`
        + `${s.novbe ? ` · növbədə ${reqem(s.novbe)}` : ''}`;
      st.title = `IP ${s.ip}, versiya ${s.versiya || '—'}`;
    }
    const kpi = [
      ['Ümumi keçid', u.say.cemi, 'bütün kameralar', true],
      ['Əməkdaş keçidi', u.say.emekdas, `${reqem(u.say.emekdasUnikal)} nəfər`, true],
      ['İşə gələn əməkdaş', u.say.emekdasUnikal, `${reqem(u.aktivEmekdas)} aktiv əməkdaşdan`],
      ['Tələbə keçidi', u.say.telebe, 'adsız sayılır'],
      ['Tanınmayan', u.say.taninmayan, 'bazada olmayan və ya aydın görünməyən'],
    ];
    $('#u-kpi').innerHTML = kpi.map(([ad, n, alt, v]) => `<div class="kart${v ? ' vurgu' : ''}"><div class="ad">${ad}</div>
      <div class="reqem">${reqem(n)}</div><div class="alt">${esc(alt)}</div></div>`).join('');
    const b = u.bugun;
    const isGunu = ![0, 6].includes(tarixObj(MEN.bugun).getUTCDay());
    $('#u-bugun').innerHTML = b ? [
      ['Bu gün gəlib', b.gelen, ''],
      ['Hazırda binada', b.binada, 'son keçidi giriş olanlar'],
      ['Gecikən', b.geciken, `${MEN.isBaslama}-dan sonra gələnlər`],
      ...(isGunu ? [['Hələ gəlməyib', Math.max(0, u.aktivEmekdas - b.gelen), 'aktiv əməkdaşlardan']] : []),
    ].map(([ad, n, alt]) => `<div class="kart"><div class="ad">${ad}</div><div class="reqem">${reqem(n)}</div>
      <div class="alt">${esc(alt)}</div></div>`).join('') : '';
    $('#u-qrafik-bas').textContent = u.seriya.nov === 'saat' ? 'Keçidlər — saatlara görə' : 'Keçidlər — günlərə görə';
    qrafikCiz($('#u-qrafik'), u.seriya, m);
    await hadiseYukle(true, !tam);
  } catch (e) {
    xetaGoster($('#u-xeta'), e);
  }
}

async function hadiseYukle(sifirla, sessiz = false) {
  const m = U.m;
  if (sifirla) { U.sonNo = null; U.bitdi = false; }
  const p = new URLSearchParams({ bas: m.bas, son: m.son, limit: '50' });
  if (U.kamera) p.set('kamera', U.kamera);
  if (U.kat) p.set('kateqoriya', U.kat);
  if (!sifirla && U.sonNo) p.set('evvel', U.sonNo);
  const qab = $('#u-hadiseler');
  if (!qab) return;
  if (sifirla && !sessiz) qab.innerHTML = '<div class="yuklenir">Yüklənir…</div>';
  try {
    const siyahi = await api(`/api/hadiseler?${p}`);
    U.hadiseler = sifirla ? siyahi : [...U.hadiseler, ...siyahi];
    U.bitdi = siyahi.length < 50;
    const son = U.hadiseler.at(-1);
    U.sonNo = son ? `${son.tarix}|${son.saat}|${son.no}` : null;
    const coxGun = m.bas !== m.son;
    qab.innerHTML = U.hadiseler.length ? `<table><thead><tr><th>Saat</th>${coxGun ? '<th>Tarix</th>' : ''}<th>Kamera</th>
      <th>İstiqamət</th><th>Növ</th><th>Şəxs</th><th>Şöbə / vəzifə</th></tr></thead><tbody>${U.hadiseler.map((h) => {
        const adam = h.kateqoriya === 'emekdas'
          ? (h.ad ? `<a href="#/emekdas/${encodeURIComponent(h.emekdas_id)}" class="adam">${avatar({ ...h, id: h.emekdas_id })}<span>${esc(tamAd(h))}</span></a>`
            : '<span class="say-qeyd">siyahıda yoxdur</span>') : '<span class="say-qeyd">—</span>';
        return `<tr><td><b>${esc(h.saat)}</b></td>${coxGun ? `<td>${tarixYaz(h.tarix)}</td>` : ''}<td>${esc(h.kamera)}</td>
          <td>${ISTIQAMET[h.istiqamet] ?? esc(h.istiqamet)}</td><td>${KATEQORIYA[h.kateqoriya] ?? esc(h.kateqoriya)}</td>
          <td>${adam}</td><td>${h.ad ? `${esc(h.sobe)}<div class="alt">${esc(h.vezife)}</div>` : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="bos">Bu müddətdə hadisə yoxdur.</div>';
    $('#u-daha').classList.toggle('gizli', U.bitdi || !U.hadiseler.length);
  } catch (e) {
    xetaGoster(qab, e);
  }
}

// ================================================================ 2. ƏMƏKDAŞLAR
const E = { q: '', sobe: '', vezife: '' };
let FILTR = null;

async function filtrlerAl() {
  if (!FILTR) FILTR = await api('/api/filtrler');
  return FILTR;
}

const secimler = (siyahi, secili, bos) => `<option value="">${bos}</option>${siyahi.map((v) => `<option${v === secili ? ' selected' : ''}>${esc(v)}</option>`).join('')}`;

async function emekdaslarSehife() {
  sehife.innerHTML = `
    <div class="bas"><div><h1>Əməkdaşlar</h1><p id="e-alt">&nbsp;</p></div></div>
    <div class="filtr">
      <label class="axtar">${IKON_AXTAR}<input type="search" id="e-q" placeholder="Ad, soyad, ata adı, şöbə və ya vəzifə" value="${esc(E.q)}" aria-label="Axtarış"></label>
      <select id="e-sobe" aria-label="Şöbə"><option value="">Bütün şöbələr</option></select>
      <select id="e-vezife" aria-label="Vəzifə"><option value="">Bütün vəzifələr</option></select>
    </div><br>
    <section class="kart"><div class="cedvel-qab" id="e-siyahi"><div class="yuklenir">Yüklənir…</div></div></section>`;
  const q = $('#e-q');
  q.addEventListener('input', debounce(() => { E.q = q.value; emekdaslarYukle(); }));
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; E.q = ''; emekdaslarYukle(); } });
  for (const [id, acar] of [['#e-sobe', 'sobe'], ['#e-vezife', 'vezife']]) {
    $(id).addEventListener('change', (e) => { E[acar] = e.target.value; emekdaslarYukle(); });
  }
  try {
    const f = await filtrlerAl();
    $('#e-sobe').innerHTML = secimler(f.sobeler, E.sobe, 'Bütün şöbələr');
    $('#e-vezife').innerHTML = secimler(f.vezifeler, E.vezife, 'Bütün vəzifələr');
  } catch { /* boş */ }
  await emekdaslarYukle();
  if (!matchMedia('(max-width: 900px)').matches) q.focus();
}

function buGunHucre(e) {
  const b = e.bugun;
  const isGunu = ![0, 6].includes(tarixObj(MEN.bugun).getUTCDay());
  if (!b) return isGunu ? '<span class="nisan bad">Gəlməyib</span>' : '<span class="say-qeyd">—</span>';
  if (b.binadadir) return `<span class="nisan ok">Binadadır</span> <span class="alt">${saatQisa(b.gelis)}-dan</span>`;
  return `<span class="nisan boz">Çıxıb</span> <span class="alt">${saatQisa(b.gelis)}–${saatQisa(b.cixis)}</span>`;
}

async function emekdaslarYukle() {
  const p = new URLSearchParams();
  for (const k of ['q', 'sobe', 'vezife']) if (E[k]) p.set(k, E[k]);
  const qab = $('#e-siyahi');
  try {
    const siyahi = await api(`/api/emekdaslar?${p}`);
    if (!qab.isConnected) return;
    const binada = siyahi.filter((e) => e.bugun?.binadadir).length;
    $('#e-alt').textContent = `${reqem(siyahi.length)} əməkdaş${E.q || E.sobe || E.vezife ? ' (süzülmüş)' : ''} · bu gün binada: ${reqem(binada)}`;
    qab.innerHTML = siyahi.length ? `<table><thead><tr><th>Əməkdaş</th><th>Şöbə</th><th>Vəzifə</th><th>Bu gün</th></tr></thead>
      <tbody>${siyahi.map((e) => `<tr class="klik" data-id="${esc(e.id)}" tabindex="0">
        <td><div class="adam">${avatar(e)}<div><b>${esc(tamAd(e))}</b><div class="alt">${esc(e.ata ? `ata adı: ${e.ata}` : '')}</div></div></div></td>
        <td>${esc(e.sobe)}</td><td>${esc(e.vezife)}</td><td>${buGunHucre(e)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="bos">${E.q ? `"${esc(E.q)}" üzrə əməkdaş tapılmadı.` : 'Əməkdaş yoxdur. Kamera sistemi əməkdaş siyahısını göndərəndən sonra burada görünəcək.'}</div>`;
    for (const tr of $$('tr[data-id]', qab)) {
      const ac = () => { location.hash = `#/emekdas/${encodeURIComponent(tr.dataset.id)}`; };
      tr.addEventListener('click', ac);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ac(); });
    }
  } catch (e) {
    xetaGoster(qab, e);
  }
}

// ---------------------------------------------------------------- əməkdaş kartı
const T = { m: { nov: 'son7' } };

async function emekdasSehife(id) {
  sehife.innerHTML = '<div class="yuklenir">Yüklənir…</div>';
  let e;
  try {
    e = await api(`/api/emekdaslar/${encodeURIComponent(id)}`);
  } catch (x) {
    sehife.innerHTML = '<a class="geri" href="#/emekdaslar">← Əməkdaşlar</a>';
    xetaGoster(sehife.appendChild(document.createElement('div')), x);
    return;
  }
  const b = e.bugun;
  const status = b.binadadir ? '<span class="nisan ok">Hazırda binadadır</span>'
    : b.gelis ? `<span class="nisan boz">Çıxıb ${saatQisa(b.cixis || b.sonGorunme)}</span>`
      : b.veziyyet === 'istirahet' ? '<span class="nisan boz">İstirahət günü</span>' : '<span class="nisan bad">Bu gün gəlməyib</span>';
  sehife.innerHTML = `
    <a class="geri" href="#/emekdaslar">← Əməkdaşlar</a>
    <section class="kart profil">
      ${e.sekil_var ? `<img class="foto" src="${sekilUrl(e.id)}" alt="${esc(tamAd(e))}">` : `<div class="foto">${esc(basHerf(e))}</div>`}
      <div>
        <h2>${esc(tamAd(e))} ${e.aktiv ? '' : '<span class="nisan boz">bazada deyil</span>'}</h2>
        <div class="vezife">${esc([e.vezife, e.sobe].filter(Boolean).join(' · '))}${e.ata ? ` · ata adı: ${esc(e.ata)}` : ''}</div>
        <div>${status} ${gecikmeYaz(b.gecikmeSan)}</div><br>
        <dl class="melumat">
          <div><dt>Bu gün gəliş</dt><dd>${saatQisa(b.gelis)}</dd></div>
          <div><dt>Çıxış</dt><dd>${b.cixis ? saatQisa(b.cixis) : (b.binadadir ? 'hələ binadadır' : '—')}</dd></div>
          <div><dt>İşdə olma</dt><dd>${muddet(b.isdeSan)}</dd></div>
          <div><dt>İşdə olmama (gün içində)</dt><dd>${b.gelis ? muddet(b.olmamaSan) : '—'}</dd></div>
          <div><dt>İş qrafiki</dt><dd>${esc(MEN.isBaslama)}–${esc(MEN.isBitme)}</dd></div>
        </dl>
      </div>
    </section>
    <div class="yanyana">
      <section class="kart"><div class="kart-bas"><h2>Bu günün keçidləri</h2><span class="say-qeyd">${tarixUzun(MEN.bugun)}</span></div>
        ${b.hadiseler.length ? `<ul class="zaman">${b.hadiseler.map((h) => `<li><span class="saat">${esc(h.saat)}</span>
          ${ISTIQAMET[h.istiqamet] ?? ''}<span class="say-qeyd">${esc(h.kamera)}</span></li>`).join('')}</ul>`
          : '<div class="bos">Bu gün keçid yoxdur.</div>'}
        ${b.qeydler.length ? `<div class="bosluq">${b.qeydler.map(esc).join('; ')}</div>` : ''}
      </section>
      <section class="kart"><div class="kart-bas"><h2>İşdə olmadığı vaxt (bu gün)</h2><b>${b.gelis ? muddet(b.olmamaSan) : '—'}</b></div>
        ${b.bosluqlar.length ? `<ul class="zaman">${b.bosluqlar.map((x) => `<li><span class="saat">${saatQisa(x.cixis)}</span>
          çıxıb → <span class="saat">${saatQisa(x.qayitma)}</span> qayıdıb <span class="nisan warn">${muddet(x.san)}</span></li>`).join('')}</ul>`
          : `<div class="bos">${b.gelis ? 'Gün ərzində binadan çıxmayıb.' : '—'}</div>`}
      </section>
    </div>
    <section class="kart">
      <div class="kart-bas"><h2>Tarixçə</h2>
        <div class="filtr"><div class="filtr" id="t-muddet"></div>
          <button class="dugme esas-d" type="button" id="t-excel">${IKON_EXCEL}Excel</button></div></div>
      <div class="kart-ici say-qeyd" id="t-xulase"></div>
      <div class="cedvel-qab" id="t-cedvel"></div>
    </section>`;
  const yukle = async () => {
    const m = T.m;
    const qab = $('#t-cedvel');
    qab.innerHTML = '<div class="yuklenir">Yüklənir…</div>';
    try {
      const t = await api(`/api/emekdaslar/${encodeURIComponent(id)}/tarixce?bas=${m.bas}&son=${m.son}`);
      const x = t.xulase;
      $('#t-xulase').innerHTML = `${muddetMetni(m)}: gəldiyi gün <b>${x.gelenGun}</b> · gəlmədiyi iş günü <b>${x.gelmeyenGun}</b> ·
        cəmi işdə <b>${muddet(x.isdeSan)}</b> · işdə olmama <b>${muddet(x.olmamaSan)}</b> · gecikmə <b>${x.gecikmeSayi}</b> dəfə
        (${muddet(x.gecikmeSan)}) · orta gəliş <b>${x.ortaGelis ?? '—'}</b>`;
      qab.innerHTML = gunCedveli(t.setirler);
    } catch (x) {
      xetaGoster(qab, x);
    }
  };
  muddetQur($('#t-muddet'), T.m, ['son7', 'buay', 'kecenay', 'araliq'], yukle);
  $('#t-excel').addEventListener('click', (ev) => excelEndir(new URLSearchParams({ bas: T.m.bas, son: T.m.son, emekdas: id }), ev.currentTarget));
  await yukle();
}

function gunCedveli(setirler) {
  if (!setirler.length) return '<div class="bos">Bu müddətdə qeyd yoxdur.</div>';
  return `<table><thead><tr><th>Tarix</th><th>Gün</th><th class="reqem">Gəliş</th><th class="reqem">Çıxış</th>
    <th class="reqem">İşdə olma</th><th class="reqem">İşdə olmama</th><th>Gecikmə</th><th>Qeyd</th></tr></thead>
    <tbody>${setirler.map((s) => `<tr><td><b>${tarixYaz(s.tarix)}</b></td><td>${esc(s.hefte)}</td>
      ${s.veziyyet === 'gelmeyib' || s.veziyyet === 'istirahet'
    ? `<td colspan="4">${veziyyetNisan(s)}</td><td></td><td></td>`
    : `<td class="reqem">${saatQisa(s.gelis)}</td><td class="reqem">${s.cixis ? saatQisa(s.cixis) : (s.binadadir ? veziyyetNisan(s) : '—')}</td>
      <td class="reqem">${muddet(s.isdeSan)}</td><td class="reqem">${muddet(s.olmamaSan)}</td>
      <td>${gecikmeYaz(s.gecikmeSan)}</td><td><span class="alt">${qeydYaz(s)}</span></td>`}</tr>`).join('')}</tbody></table>`;
}

// ================================================================ 3. HESABAT
const H = { m: { nov: 'ay' }, q: '', sobe: '', vezife: '', emekdas: null, emekdasAd: '' };

function hesabatParam(emekdasIle = true) {
  const p = new URLSearchParams({ bas: H.m.bas, son: H.m.son });
  for (const k of ['q', 'sobe', 'vezife']) if (H[k]) p.set(k, H[k]);
  if (emekdasIle && H.emekdas) p.set('emekdas', H.emekdas);
  return p;
}

async function hesabatSehife() {
  sehife.innerHTML = `
    <div class="bas"><div><h1>Hesabat</h1><p>Gəliş, çıxış və işdə olmama — seçilmiş müddət və süzgəc üzrə. Excel nə seçilibsə onu çıxarır.</p></div>
      <button class="dugme esas-d" type="button" id="h-excel">${IKON_EXCEL}Excel-ə çıxar</button></div>
    <div class="filtr" id="h-muddet"></div><br>
    <div class="filtr">
      <label class="axtar">${IKON_AXTAR}<input type="search" id="h-q" placeholder="Əməkdaş axtar" value="${esc(H.q)}" aria-label="Axtarış"></label>
      <select id="h-sobe" aria-label="Şöbə"><option value="">Bütün şöbələr</option></select>
      <select id="h-vezife" aria-label="Vəzifə"><option value="">Bütün vəzifələr</option></select>
      <span id="h-secili"></span>
    </div><br>
    <p class="say-qeyd" id="h-izah"></p>
    <section class="kart"><div class="kart-bas"><h2 id="h-bas">Əməkdaşlar üzrə xülasə</h2><span class="say-qeyd">sətirə klikləyin — günlər açılsın</span></div>
      <div class="cedvel-qab" id="h-xulase"></div></section>
    <section class="kart gizli" id="h-gunler-kart"><div class="kart-bas"><h2 id="h-gunler-bas"></h2></div>
      <div class="cedvel-qab" id="h-gunler"></div></section>`;
  muddetQur($('#h-muddet'), H.m, ['gun', 'ay', 'son7', 'araliq'], hesabatYukle);
  const q = $('#h-q');
  q.addEventListener('input', debounce(() => { H.q = q.value; hesabatYukle(); }));
  for (const [id, acar] of [['#h-sobe', 'sobe'], ['#h-vezife', 'vezife']]) {
    $(id).addEventListener('change', (e) => { H[acar] = e.target.value; hesabatYukle(); });
  }
  $('#h-excel').addEventListener('click', (e) => excelEndir(hesabatParam(), e.currentTarget));
  try {
    const f = await filtrlerAl();
    $('#h-sobe').innerHTML = secimler(f.sobeler, H.sobe, 'Bütün şöbələr');
    $('#h-vezife').innerHTML = secimler(f.vezifeler, H.vezife, 'Bütün vəzifələr');
  } catch { /* boş */ }
  await hesabatYukle();
}

function hesabatIzah() {
  const f = [H.sobe && `şöbə: ${H.sobe}`, H.vezife && `vəzifə: ${H.vezife}`, H.q && `axtarış: "${H.q}"`].filter(Boolean);
  const kim = H.emekdas ? esc(H.emekdasAd) : `${f.length ? esc(f.join(', ')) : 'bütün aktiv əməkdaşlar'}`;
  $('#h-izah').innerHTML = `Excel: <b>${kim}</b> · ${muddetMetni(H.m)}`;
  $('#h-secili').innerHTML = H.emekdas
    ? `<span class="cip">${esc(H.emekdasAd)}<button type="button" aria-label="Seçimi ləğv et" id="h-sil">×</button></span>` : '';
  $('#h-sil')?.addEventListener('click', () => { H.emekdas = null; hesabatYukle(); });
}

async function hesabatYukle() {
  const qab = $('#h-xulase');
  if (!qab) return;
  hesabatIzah();
  qab.innerHTML = '<div class="yuklenir">Yüklənir…</div>';
  try {
    const h = await api(`/api/hesabat?${hesabatParam(false)}`);
    $('#h-bas').textContent = `Əməkdaşlar üzrə xülasə — ${h.xulase.length}`;
    qab.innerHTML = h.xulase.length ? `<table><thead><tr><th>Əməkdaş</th><th>Şöbə</th><th>Vəzifə</th>
      <th class="reqem">Gəldiyi gün</th><th class="reqem">Gəlmədiyi iş günü</th><th class="reqem">Cəmi işdə</th>
      <th class="reqem">İşdə olmama</th><th class="reqem">Gecikmə</th><th class="reqem">Orta gəliş</th></tr></thead>
      <tbody>${h.xulase.map((x) => `<tr class="klik${x.id === H.emekdas ? ' secili' : ''}" data-id="${esc(x.id)}" data-ad="${esc(tamAd(x))}" tabindex="0">
        <td><b>${esc(`${x.soyad} ${x.ad}`)}</b><div class="alt">${esc(x.ata)}</div></td><td>${esc(x.sobe)}</td><td>${esc(x.vezife)}</td>
        <td class="reqem">${x.gelenGun}</td><td class="reqem">${x.gelmeyenGun ? `<span class="nisan bad">${x.gelmeyenGun}</span>` : 0}</td>
        <td class="reqem">${muddet(x.isdeSan)}</td><td class="reqem">${muddet(x.olmamaSan)}</td>
        <td class="reqem">${x.gecikmeSayi ? `${x.gecikmeSayi} dəfə · ${muddet(x.gecikmeSan)}` : '—'}</td>
        <td class="reqem">${x.ortaGelis ?? '—'}</td></tr>`).join('')}</tbody></table>`
      : '<div class="bos">Süzgəcə uyğun əməkdaş yoxdur.</div>';
    for (const tr of $$('tr[data-id]', qab)) {
      const sec = () => {
        H.emekdas = H.emekdas === tr.dataset.id ? null : tr.dataset.id;
        H.emekdasAd = tr.dataset.ad;
        hesabatYukle();
      };
      tr.addEventListener('click', sec);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') sec(); });
    }
    const kart = $('#h-gunler-kart');
    if (!H.emekdas || !h.xulase.some((x) => x.id === H.emekdas)) {
      H.emekdas = null;
      hesabatIzah();
      kart.classList.add('gizli');
      return;
    }
    kart.classList.remove('gizli');
    $('#h-gunler-bas').innerHTML = `${esc(H.emekdasAd)} — ${muddetMetni(H.m)} <a class="say-qeyd" href="#/emekdas/${encodeURIComponent(H.emekdas)}">kartı aç →</a>`;
    const g = await api(`/api/hesabat?${hesabatParam(true)}`);
    $('#h-gunler').innerHTML = gunCedveli(g.setirler);
    kart.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    xetaGoster(qab, e);
  }
}

// ================================================================ yönləndirmə
async function yonlendir() {
  clearInterval(taymer);
  taymer = null;
  const [, yol = 'umumi', param] = (location.hash || '#/umumi').split('/');
  const nav = yol === 'emekdas' ? 'emekdaslar' : yol;
  for (const a of $$('.nav a')) a.classList.toggle('aktiv', a.dataset.nav === nav);
  window.scrollTo(0, 0);
  if (yol === 'emekdaslar') return emekdaslarSehife();
  if (yol === 'emekdas' && param) return emekdasSehife(decodeURIComponent(param));
  if (yol === 'hesabat') return hesabatSehife();
  if (location.hash && location.hash !== '#/umumi') history.replaceState(null, '', '#/umumi');
  return umumiSehife();
}

async function basla() {
  try {
    MEN = await api('/api/men');
  } catch {
    return;
  }
  $('#istifadeci').textContent = MEN.ad;
  $('#cixis').addEventListener('click', async () => {
    await api('/api/cixis', { method: 'POST' }).catch(() => {});
    location.replace('/giris');
  });
  window.addEventListener('hashchange', yonlendir);
  window.addEventListener('resize', debounce(() => { if ($('#u-qrafik')) umumiYukle(false); }, 300));
  yonlendir();
}

basla();
