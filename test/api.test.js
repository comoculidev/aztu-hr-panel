// API: kamera sistemindən qəbul, login, panel sorğuları, Excel. Müvəqqəti baza (yaddaşda), təsadüfi port.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { appQur } from '../src/app.js';
import { istifadeciYaz } from '../src/auth.js';
import { bazaAc, buGun, kohneSekilleriSil } from '../src/db.js';

process.env.TZ = 'Asia/Baku';
const sakit = { info() {}, warn() {}, error() {} };
const ACAR = randomBytes(24).toString('base64url');
const PAROL = randomBytes(12).toString('base64url');           // sınaq parolu — hər işləmədə yeni
const k = { ingestAcar: ACAR, ingestIp: [], isBaslama: '09:00', isBitme: '18:00', sessiyaSaat: 8, tehlukesizKuki: false };
const ALI = 'ali|veliyev|rasim|dosent|kibertehlukesizlik';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');

let db;
let server;
let url;

async function sorgu(yol, { metod = 'GET', govde, kuki, basliq = {} } = {}) {
  const c = await fetch(url + yol, {
    method: metod, redirect: 'manual',
    headers: { ...(govde ? { 'Content-Type': 'application/json' } : {}), ...(kuki ? { Cookie: kuki } : {}), ...basliq },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  const tip = c.headers.get('content-type') || '';
  return { status: c.status, c, json: tip.includes('json') ? await c.json() : null };
}
const ingest = (yol, govde, acar = ACAR) => sorgu(`/api/v1/ingest/${yol}`, { metod: 'POST', govde, basliq: { Authorization: `Bearer ${acar}` } });

async function giris() {
  const r = await sorgu('/api/giris', { metod: 'POST', govde: { ad: 'hr.sinaq', parol: PAROL } });
  assert.equal(r.status, 200);
  return r.c.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  db = bazaAc(':memory:');
  istifadeciYaz(db, 'hr.sinaq', PAROL, 'hr');
  server = appQur(db, k, sakit).listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); });

test('girişsiz heç nə görünmür (sağlamlıq yoxlamasından başqa)', async () => {
  assert.equal((await sorgu('/api/umumi')).status, 401);
  const s = await sorgu('/api/saglamliq');
  assert.equal(s.status, 200);
  assert.deepEqual([s.json.ok, s.json.kameraApi], [true, true]);
  const r = await sorgu('/');
  assert.equal(r.status, 302);
  assert.equal(r.c.headers.get('location'), '/giris');
  assert.equal((await sorgu('/giris')).status, 200);
});

test('kamera API-si: açar olmadan rədd', async () => {
  assert.equal((await ingest('hadiseler', { hadiseler: [] }, 'sehv')).status, 401);
  assert.equal((await sorgu('/api/v1/ingest/hadiseler', { metod: 'POST', govde: { hadiseler: [] } })).status, 401);
});

test('kamera API-si: icazəsiz IP rədd', async () => {
  const s = appQur(db, { ...k, ingestIp: ['192.0.2.77'] }, sakit).listen(0, '127.0.0.1');
  await new Promise((ok) => s.once('listening', ok));
  const c = await fetch(`http://127.0.0.1:${s.address().port}/api/v1/ingest/siqnal`, {
    method: 'POST', headers: { Authorization: `Bearer ${ACAR}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(c.status, 403);
  s.close();
});

test('köhnə kamera tələbəni göndərsə, əməkdaş siyahısına düşmür', async () => {
  const r = await ingest('emekdaslar', { emekdaslar: [
    { id: ALI, ad: 'Əli', soyad: 'Vəliyev', ata: 'Rasim', sobe: 'Kibertəhlükəsizlik', vezife: 'Dosent' },
    { id: 'nigar|hesenova', ad: 'Nigar', soyad: 'Həsənova', sobe: '5226a', vezife: 'MEXANIKA-MUHENDISLIYI' },
    { id: 'tural|qasimov', ad: 'Tural', soyad: 'Qasımov', sobe: 'ITT', vezife: 'STUDENT' },
  ] });
  assert.equal(r.status, 200);
  assert.equal(r.json.telebe, 2);
  assert.deepEqual(db.prepare("SELECT id FROM emekdaslar WHERE id LIKE 'nigar%' OR id LIKE 'tural%'").all(), []);
});

test('əməkdaş siyahısı, şəkil, hadisələr, siqnal', async () => {
  let r = await ingest('emekdaslar', { emekdaslar: [
    { id: ALI, ad: 'Əli', soyad: 'Vəliyev', ata: 'Rasim', sobe: 'Kibertəhlükəsizlik', vezife: 'Dosent', sekil_hash: 'h1' },
    { id: 'leyla|mammadova|kamal|laborant|fizika', ad: 'Leyla', soyad: 'Məmmədova', ata: 'Kamal', sobe: 'Fizika', vezife: 'Laborant', sekil_hash: 'h2' },
  ] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.sekil_lazim.sort(), [ALI, 'leyla|mammadova|kamal|laborant|fizika'].sort());
  r = await ingest('sekiller', { sekiller: [{ id: ALI, jpeg: JPEG }, { id: 'x', jpeg: Buffer.from('<svg/>').toString('base64') }] });
  assert.equal(r.json.qebul, 1);
  r = await ingest('emekdaslar', { emekdaslar: [
    { id: ALI, ad: 'Əli', soyad: 'Vəliyev', ata: 'Rasim', sobe: 'Kibertəhlükəsizlik', vezife: 'Dosent', sekil_hash: 'h1' }] });
  assert.deepEqual(r.json.sekil_lazim, []);               // şəkil dəyişməyib — yenidən istənmir
  assert.equal(r.json.deaktiv, 1);                        // Leyla bazadan çıxıb

  const t = buGun();
  const hadiseler = [
    { id: 'a1', tarix: t, saat: '08:55:00', kamera: 'T1', istiqamet: 'giris', kateqoriya: 'emekdas', emekdas_id: ALI, oxsarliq: 0.6 },
    { id: 'a2', tarix: t, saat: '00:00:01', kamera: 'T2', istiqamet: 'cixis', kateqoriya: 'telebe' },
    { id: 'a3', tarix: t, saat: '00:00:02', kamera: 'T1', istiqamet: 'giris', kateqoriya: 'taninmayan' },
    { id: 'pozuq', tarix: 'dünən', saat: '1', kamera: 'T1', istiqamet: 'x', kateqoriya: 'emekdas' },
  ];
  r = await ingest('hadiseler', { hadiseler });
  assert.deepEqual(r.json, { qebul: 3, tekrar: 0, pozuq: 1 });
  r = await ingest('hadiseler', { hadiseler: hadiseler.slice(0, 3) });   // kamera təkrar göndərdi
  assert.deepEqual(r.json, { qebul: 0, tekrar: 3, pozuq: 0 });
  r = await ingest('siqnal', { vaxt: 'x', kameralar: [{ ad: 'T1', istiqamet: 'giris' }], novbe: 0, versiya: 'abc' });
  assert.equal(r.status, 200);
});

test('login: səhv parol və blok', async () => {
  for (let i = 0; i < 5; i += 1) {
    const r = await sorgu('/api/giris', { metod: 'POST', govde: { ad: 'kimse', parol: 'yanlis-parol' } });
    assert.equal(r.status, 401);
  }
  assert.equal((await sorgu('/api/giris', { metod: 'POST', govde: { ad: 'kimse', parol: 'yanlis-parol' } })).status, 429);
});

test('panel: ümumi, hadisələr, axtarış, əməkdaş kartı, hesabat', async () => {
  const kuki = await giris();
  const men = await sorgu('/api/men', { kuki });
  assert.equal(men.json.ad, 'hr.sinaq');

  const u = (await sorgu('/api/umumi', { kuki })).json;
  assert.deepEqual([u.say.cemi, u.say.emekdas, u.say.telebe, u.say.taninmayan, u.say.emekdasUnikal], [3, 1, 1, 1, 1]);
  assert.equal(u.bugun.gelen, 1);
  assert.equal(u.bugun.binada, 1);
  assert.deepEqual(u.bugun.siyahi.binada.map((e) => [e.soyad, e.gelis]), [['Vəliyev', '08:55:00']]);
  assert.deepEqual(u.bugun.siyahi.geciken, []);                // 08:55 — gecikmə yoxdur
  assert.equal(u.siqnal.onlayn, true);
  assert.equal(u.seriya.nov, 'saat');

  const h = (await sorgu('/api/hadiseler?kateqoriya=emekdas', { kuki })).json;
  assert.equal(h.length, 1);
  assert.equal(h[0].soyad, 'Vəliyev');
  // keçid vaxtına görə (ən yenisi əvvəldə), "daha çox" kursoru ilə davam
  const hamisi = (await sorgu('/api/hadiseler?limit=2', { kuki })).json;
  assert.deepEqual(hamisi.map((x) => x.saat), ['08:55:00', '00:00:02']);
  const kursor = encodeURIComponent(`${hamisi[1].tarix}|${hamisi[1].saat}|${hamisi[1].no}`);
  assert.deepEqual((await sorgu(`/api/hadiseler?evvel=${kursor}`, { kuki })).json.map((x) => x.saat), ['00:00:01']);

  const axtar = (await sorgu(`/api/emekdaslar?q=${encodeURIComponent('veliyev eli')}`, { kuki })).json;
  assert.deepEqual(axtar.map((e) => e.id), [ALI]);
  assert.equal(axtar[0].bugun.gelis, '08:55:00');
  assert.equal((await sorgu('/api/emekdaslar?q=memmedova', { kuki })).json.length, 0);   // deaktiv
  assert.equal((await sorgu(`/api/emekdaslar?sobe=${encodeURIComponent('Kibertəhlükəsizlik')}`, { kuki })).json.length, 1);

  const kart = (await sorgu(`/api/emekdaslar/${encodeURIComponent(ALI)}`, { kuki })).json;
  assert.equal(kart.bugun.gelis, '08:55:00');
  assert.equal(kart.bugun.binadadir, true);
  assert.equal(kart.bugun.hadiseler.length, 1);
  const sekil = await sorgu(`/api/emekdaslar/${encodeURIComponent(ALI)}/sekil`, { kuki });
  assert.equal(sekil.c.headers.get('content-type'), 'image/jpeg');

  const tarixce = (await sorgu(`/api/emekdaslar/${encodeURIComponent(ALI)}/tarixce`, { kuki })).json;
  assert.equal(tarixce.setirler[0].gelis, '08:55:00');

  const f = (await sorgu('/api/filtrler', { kuki })).json;
  assert.deepEqual(f.sobeler, ['Kibertəhlükəsizlik']);

  const hes = (await sorgu('/api/hesabat', { kuki })).json;
  assert.equal(hes.xulase.length, 1);
  assert.equal(hes.setirler, undefined);
  const hes1 = (await sorgu(`/api/hesabat?emekdas=${encodeURIComponent(ALI)}`, { kuki })).json;
  assert.equal(hes1.setirler.length, 1);

  assert.equal((await sorgu('/api/umumi?bas=2026-13-01', { kuki })).status, 400);
  assert.equal((await sorgu('/api/umumi?bas=2026-01-01&son=2025-01-01', { kuki })).status, 400);
});

test('Excel: ekrandakı süzgəclə', async () => {
  const kuki = await giris();
  const c = await fetch(`${url}/api/hesabat/excel?sobe=${encodeURIComponent('Kibertəhlükəsizlik')}`, { headers: { Cookie: kuki } });
  assert.equal(c.status, 200);
  assert.match(c.headers.get('content-disposition'), /davamiyyet_/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await c.arrayBuffer()));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Xülasə', 'Gündəlik', 'Parametrlər']);
  assert.equal(wb.getWorksheet('Xülasə').getRow(2).getCell(1).value, 'Vəliyev');
  const g = wb.getWorksheet('Gündəlik');
  const basliq = g.getRow(1).values.slice(1);
  assert.equal(g.getRow(2).getCell(basliq.indexOf('Gəliş') + 1).value, '08:55:00');
  assert.ok(basliq.includes('Kənarda (cəmi)') && basliq.includes('Kənarda olduğu vaxtlar'));
  assert.equal(g.getRow(2).getCell(basliq.indexOf('Kənarda (cəmi)') + 1).value, '0 dəq');
});

test('bu gün diqqət: gecikmə fərdi saata görə; kart və Excel qrafiki göstərir', async () => {
  const { qrafikYaz } = await import('../src/qrafik.js');
  const kuki = await giris();
  // Standart 09:00 — 08:55 gecikmə deyil; fərdi 08:00–15:00 ilə 55 dəq gecikmədir
  qrafikYaz(db, { emekdasId: ALI, bas: buGun(), baslama: '08:00', bitme: '15:00', menbe: 'el', kim: 't' });
  try {
    const u = (await sorgu('/api/umumi', { kuki })).json;
    assert.deepEqual(u.bugun.siyahi.geciken.map((e) => [e.soyad, e.gecikmeSan]), [['Vəliyev', 3300]]);
    const kart = (await sorgu(`/api/emekdaslar/${encodeURIComponent(ALI)}`, { kuki })).json;
    assert.deepEqual(kart.bugun.qrafik, { ad: 'Fərdi', baslama: '08:00', bitme: '15:00' });
    const siyahi = (await sorgu('/api/emekdaslar', { kuki })).json;
    assert.equal(siyahi.find((e) => e.id === ALI).bugun.gecikmeSan, 3300);
    const c = await fetch(`${url}/api/hesabat/excel?emekdas=${encodeURIComponent(ALI)}`, { headers: { Cookie: kuki } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await c.arrayBuffer()));
    const g = wb.getWorksheet('Gündəlik');
    assert.equal(g.getRow(2).getCell(g.getRow(1).values.indexOf('Qrafik')).value, '08:00–15:00');
    const x = wb.getWorksheet('Xülasə');
    assert.equal(x.getRow(2).getCell(x.getRow(1).values.indexOf('Qrafik')).value, 'Fərdi (08:00–15:00)');
  } finally {
    db.prepare('DELETE FROM emekdas_qrafik').run();
  }
});

test('çıxış: CSRF başlığı olmadan rədd, sonra sessiya bağlanır', async () => {
  const kuki = await giris();
  assert.equal((await sorgu('/api/cixis', { metod: 'POST', kuki })).status, 403);
  assert.equal((await sorgu('/api/cixis', { metod: 'POST', kuki, basliq: { 'X-Aztu': '1' } })).status, 200);
  assert.equal((await sorgu('/api/men', { kuki })).status, 401);
});

test('tanınmayanların üzü: qəbul, süzgəc (qapı, tarix, saat), şəkil, 30 gün', async () => {
  const t = buGun();
  const uz = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString('base64');
  const r = await ingest('hadiseler', { hadiseler: [
    { id: 'u1', tarix: t, saat: '09:10:00', kamera: 'T1', istiqamet: 'giris', kateqoriya: 'taninmayan', adam_no: 'G7', sekil: uz },
    { id: 'u2', tarix: t, saat: '15:20:00', kamera: 'T2', istiqamet: 'cixis', kateqoriya: 'taninmayan', adam_no: 'G7', sekil: uz },
    { id: 'u3', tarix: t, saat: '16:00:00', kamera: 'T1', istiqamet: 'giris', kateqoriya: 'emekdas', emekdas_id: ALI, sekil: uz },
  ] });
  assert.equal(r.json.qebul, 3);
  const kuki = await giris();
  let s = (await sorgu('/api/taninmayanlar', { kuki })).json;
  assert.deepEqual(s.siyahi.filter((x) => x.sekil_var).map((x) => x.saat), ['15:20:00', '09:10:00']);
  assert.equal(s.siyahi[0].adam_no, 'G7');
  assert.equal(s.sekilliSay, 2);
  assert.ok(s.say > 2);
  assert.equal((await sorgu('/api/taninmayanlar?sekilli=1', { kuki })).json.say, 2);
  // "şəkil yoxdur"un səbəbi: kamera siqnalda şəkil göndərib-göndərmədiyini bildirir (köhnə kamera — null)
  await ingest('siqnal', { kameralar: [] });
  assert.equal((await sorgu('/api/taninmayanlar', { kuki })).json.kameraSekil, null);
  await ingest('siqnal', { kameralar: [], taninmayan_sekli: false });
  assert.equal((await sorgu('/api/taninmayanlar', { kuki })).json.kameraSekil, false);
  await ingest('siqnal', { kameralar: [], taninmayan_sekli: true });
  assert.equal((await sorgu('/api/taninmayanlar', { kuki })).json.kameraSekil, true);
  s = (await sorgu('/api/taninmayanlar?kamera=T1', { kuki })).json;
  assert.ok(s.siyahi.every((x) => x.kamera === 'T1'));
  s = (await sorgu('/api/taninmayanlar?saatBas=15:00&saatSon=16:00', { kuki })).json;
  assert.deepEqual(s.siyahi.map((x) => x.saat), ['15:20:00']);
  s = (await sorgu('/api/taninmayanlar?adam=G7', { kuki })).json;
  assert.equal(s.say, 2);
  const sekil = await fetch(`${url}/api/hadise-sekil/${s.siyahi[0].no}`, { headers: { Cookie: kuki } });
  assert.equal(sekil.headers.get('content-type'), 'image/jpeg');
  // əməkdaş hadisəsinin şəkli saxlanmır
  const emekdas = db.prepare("SELECT sekil FROM hadiseler WHERE id = 'u3'").get();
  assert.equal(emekdas.sekil, null);
  // 30 gündən köhnə şəkil silinir, hadisənin özü qalır
  db.prepare(`INSERT INTO hadiseler (id, tarix, saat, kamera, istiqamet, kateqoriya, sekil, alindi)
              VALUES ('kohne', '2000-01-01', '10:00:00', 'T1', 'giris', 'taninmayan', ?, '')`).run(Buffer.from(uz, 'base64'));
  assert.equal(kohneSekilleriSil(db, 30), 1);
  assert.equal(db.prepare("SELECT sekil FROM hadiseler WHERE id = 'kohne'").get().sekil, null);
  assert.equal((await sorgu('/api/taninmayanlar?saatBas=25:00', { kuki })).status, 400);
});

// ---------------------------------------------------------------- iş qrafiki və kadr yükləmə
const yaz = (yol, govde, kuki, metod = 'POST') => sorgu(yol, { metod, govde, kuki, basliq: { 'X-Aztu': '1' } });

test('qrafik: şablonlar, saat dəyişikliyi tarixlə, əməkdaşa fərdi saat', async () => {
  const kuki = await giris();
  const t = buGun();
  try {
    let s = (await sorgu('/api/qrafik/sablonlar', { kuki })).json;
    assert.equal(s.length, 6);
    const tam = s.find((x) => x.acar === 'tam_1');
    assert.deepEqual([tam.baslama, tam.bitme, tam.saatlar.length], ['09:00', '17:30', 1]);
    assert.equal((await yaz(`/api/qrafik/sablonlar/${tam.id}/saat`, { bas: t, baslama: '08:30', bitme: '17:00' }, kuki)).status, 200);
    s = (await sorgu('/api/qrafik/sablonlar', { kuki })).json;
    const tam2 = s.find((x) => x.acar === 'tam_1');
    assert.deepEqual([tam2.baslama, tam2.saatlar.length], ['08:30', 2]);

    const yol = `/api/emekdaslar/${encodeURIComponent(ALI)}/qrafik`;
    assert.equal((await yaz(yol, { bas: t, sablon_id: tam.id }, kuki)).status, 200);
    assert.equal((await sorgu('/api/qrafik/sablonlar', { kuki })).json.find((x) => x.acar === 'tam_1').emekdasSayi, 1);
    assert.equal((await yaz(yol, { bas: t, baslama: '10:00', bitme: '15:00' }, kuki)).status, 200);
    const q = (await sorgu(yol, { kuki })).json;
    assert.deepEqual([q.indiki.ad, q.indiki.menbe, q.indiki.baslama, q.tarixce.length], ['Fərdi', 'el', '10:00', 1]);
    assert.equal(q.tarixce[0].kim, 'hr.sinaq');
  } finally {
    db.prepare('DELETE FROM emekdas_qrafik').run();
    db.prepare("DELETE FROM sablon_saatlari WHERE kim <> 'sistem'").run();
  }
});

test('qrafik: yoxlama xətaları 400, tapılmayan əməkdaş 404, CSRF başlığı olmadan 403', async () => {
  const kuki = await giris();
  const yol = `/api/emekdaslar/${encodeURIComponent(ALI)}/qrafik`;
  for (const g of [{ bas: '2026-11-03', baslama: '17:00', bitme: '09:00' }, { bas: '2026-11-03', baslama: '25:00', bitme: '26:00' },
    { bas: '2026-02-30', baslama: '09:00', bitme: '17:00' }, { bas: '2026-11-03', sablon_id: 9999 }, { bas: '2026-11-03' }]) {
    assert.equal((await yaz(yol, g, kuki)).status, 400, JSON.stringify(g));
  }
  assert.equal((await yaz('/api/emekdaslar/yoxdur/qrafik', { bas: '2026-11-03', sablon_id: 1 }, kuki)).status, 404);
  assert.equal((await yaz('/api/qrafik/sablonlar/9999/saat', { bas: '2026-11-03', baslama: '09:00', bitme: '17:00' }, kuki)).status, 404);
  assert.equal((await sorgu(yol, { metod: 'POST', govde: { bas: '2026-11-03', sablon_id: 1 }, kuki })).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM emekdas_qrafik').get().n, 0);
});

test('kadr yükləmə: nəticə, təsdiq, tapılmayanların Excel-i', async () => {
  const kuki = await giris();
  db.prepare(`INSERT INTO emekdaslar (id, ad, soyad, sobe, vezife, axtaris, yaradilib, yenilenib)
    VALUES ('samir', 'Samir', 'Quliyev', 'Fizika', 'Laborant', '', '2026-01-01', '2026-01-01')`).run();
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Person');
    ws.addRow(['Pin kod', 'Adı', 'Soyadı', 'Atasının adı', 'Vəzifəsi', 'İşçilərin tipi', 'Ştat vahidi', 'İş vaxtı']);
    ws.addRow(['ZZZ9999', 'Əli', 'Vəliyev', 'Rasim', 'Dosent', 'Əsas', '1', 'Tam']);
    ws.addRow(['ZZZ8888', 'Samir', 'Quluyev', '', 'Laborant', 'Əsas', '0.50', 'Tam']);
    ws.addRow(['ZZZ7777', 'Nərgiz', 'Abbasova', '', 'Kargüzar', 'Əsas', '1', 'Tam']);
    const c = await fetch(`${url}/api/kadr/yukle?bas=${buGun()}`, { method: 'POST',
      headers: { Cookie: kuki, 'X-Aztu': '1', 'Content-Type': 'application/octet-stream' }, body: Buffer.from(await wb.xlsx.writeBuffer()) });
    const metn = await c.text();
    assert.equal(c.status, 200, metn);
    assert.ok(!metn.includes('ZZZ'));
    const n = JSON.parse(metn);
    assert.deepEqual([n.cemi, n.tapildi, n.yazildi, n.ehtimal.length, n.yoxdur.length], [3, 1, 1, 1, 1]);
    assert.deepEqual(n.ehtimal[0].namizedler.map((x) => x.id), ['samir']);

    const t = await yaz('/api/kadr/tesdiq', { bas: buGun(), emekdas_id: 'samir', setirler: n.ehtimal[0].sexs.setirler }, kuki);
    assert.equal(t.status, 200);
    const q = (await sorgu('/api/emekdaslar/samir/qrafik', { kuki })).json;
    assert.deepEqual([q.indiki.ad, q.indiki.menbe, q.kadr[0].stat], ['Tam, 0,5 ştat', 'excel', 0.5]);
    // təsdiq yadda qalır: yenidən yükləmədə Samir Quluyev artıq "ehtimal" deyil
    const c2 = await fetch(`${url}/api/kadr/yukle?bas=${buGun()}`, { method: 'POST',
      headers: { Cookie: kuki, 'X-Aztu': '1', 'Content-Type': 'application/octet-stream' }, body: Buffer.from(await wb.xlsx.writeBuffer()) });
    const n2 = await c2.json();
    assert.deepEqual([n2.tapildi, n2.ehtimal.length], [2, 0]);
    assert.ok(Array.isArray(n2.excelsiz) && !n2.excelsiz.some((e) => e.id === 'samir'));

    const x = await fetch(`${url}/api/kadr/excel`, { method: 'POST',
      headers: { Cookie: kuki, 'X-Aztu': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ setirler: n.yoxdur }) });
    assert.equal(x.status, 200);
    assert.match(x.headers.get('content-type'), /spreadsheetml/);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(Buffer.from(await x.arrayBuffer()));
    assert.equal(wb2.worksheets[0].rowCount, 2);
    assert.equal(wb2.worksheets[0].getRow(2).getCell(2).value, 'Abbasova');
  } finally {
    db.prepare('DELETE FROM emekdas_qrafik').run();
    db.prepare('DELETE FROM kadr_melumati').run();
    db.prepare('DELETE FROM kadr_esleme').run();
    db.prepare("DELETE FROM emekdaslar WHERE id = 'samir'").run();
  }
});

test('kadr yükləmə: Excel olmayan və boş fayl 400', async () => {
  const kuki = await giris();
  for (const body of [Buffer.from('bu excel deyil'), Buffer.alloc(0)]) {
    const c = await fetch(`${url}/api/kadr/yukle`, { method: 'POST',
      headers: { Cookie: kuki, 'X-Aztu': '1', 'Content-Type': 'application/octet-stream' }, body });
    assert.equal(c.status, 400);
  }
});

// ---------------------------------------------------------------- kadr əlavə etmə, redaktə, silmə
test('sinxron: HR düzəlişi, silinmə və əl ilə kadr qorunur', async () => {
  const kuki = await giris();
  const elave = db.prepare(`INSERT INTO emekdaslar (id, ad, soyad, menbe, hr_duzelib, silinib, aktiv, axtaris, yaradilib, yenilenib)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', '2026-01-01', '2026-01-01')`);
  elave.run('k1', 'Nərmin', 'Qasımova', 'kamera', 1, 0, 1);
  elave.run('k2', 'Silinən', 'Adam', 'kamera', 0, 1, 0);
  elave.run('el-000000000001', 'Paneldən', 'Kadr', 'el', 0, 0, 1);
  // digər testlərin kamera əməkdaşları da siyahıda qalsın (yoxsa deaktiv olardı)
  const qalan = db.prepare("SELECT id, ad, soyad, ata, sobe, vezife FROM emekdaslar WHERE aktiv = 1 AND menbe = 'kamera' AND id <> 'k1'").all()
    .map((e) => ({ ...e }));
  try {
    const r = await ingest('emekdaslar', { emekdaslar: [...qalan, { id: 'k1', ad: 'Nermin2', soyad: 'Q' },
      { id: 'k2', ad: 'X', soyad: 'Y' }, { id: 'k3', ad: 'Yeni', soyad: 'Z' }] });
    assert.equal(r.status, 200);
    const s = (id) => db.prepare('SELECT ad, soyad, aktiv, menbe FROM emekdaslar WHERE id = ?').get(id);
    assert.deepEqual([s('k1').ad, s('k1').soyad], ['Nərmin', 'Qasımova']);
    assert.equal(s('k2').aktiv, 0);
    assert.equal(s('el-000000000001').aktiv, 1);
    assert.deepEqual([s('k3').aktiv, s('k3').menbe], [1, 'kamera']);
    // HR şəkli kameranınkından üstündür
    const hr = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(50, 7)]);
    db.prepare("UPDATE emekdaslar SET sekil = ?, hr_sekil = ? WHERE id = 'k1'").run(Buffer.from(JPEG, 'base64'), hr);
    const c = await fetch(`${url}/api/emekdaslar/k1/sekil`, { headers: { Cookie: kuki } });
    assert.deepEqual(Buffer.from(await c.arrayBuffer()), hr);
    const siyahi = (await sorgu('/api/emekdaslar', { kuki })).json;
    const el = siyahi.find((e) => e.id === 'el-000000000001');
    assert.deepEqual([el.menbe, el.hr_duzelib], ['el', 0]);
    assert.equal(siyahi.find((e) => e.id === 'k1').sekil_var, 1);
  } finally {
    db.prepare("DELETE FROM emekdaslar WHERE id IN ('k1', 'k2', 'k3', 'el-000000000001')").run();
  }
});

test('kadr idarəsi API: əlavə, redaktə, silmə, link, şəkil', async () => {
  const kuki = await giris();
  const stat05 = (await sorgu('/api/qrafik/sablonlar', { kuki })).json.find((s) => s.acar === 'stat_05').id;
  let id;
  try {
    // əlavə: sessiya və CSRF başlığı tələb olunur
    assert.equal((await sorgu('/api/emekdaslar', { metod: 'POST', govde: { ad: 'Tural', soyad: 'Nəbiyev' } })).status, 401);
    assert.equal((await sorgu('/api/emekdaslar', { metod: 'POST', govde: { ad: 'Tural', soyad: 'Nəbiyev' }, kuki })).status, 403);
    assert.equal((await yaz('/api/emekdaslar', { soyad: 'Nəbiyev' }, kuki)).status, 400);
    assert.equal((await yaz('/api/emekdaslar', { ad: 'Tural', soyad: 'Nəbiyev', sablon_id: 9999 }, kuki)).status, 400);
    const r = await yaz('/api/emekdaslar', { ad: 'Tural', soyad: 'Nəbiyev', vezife: 'Laborant', sablon_id: stat05 }, kuki);
    assert.equal(r.status, 201);
    id = r.json.id;
    assert.match(id, /^el-[0-9a-f]{12}$/);
    assert.equal((await sorgu(`/api/emekdaslar/${id}/qrafik`, { kuki })).json.indiki.ad, 'Tam, 0,5 ştat');

    // redaktə
    assert.equal((await yaz(`/api/emekdaslar/${id}`, { ad: 'Tural', soyad: 'Nəbiyev2' }, kuki, 'PUT')).status, 200);
    const tapilan = (await sorgu('/api/emekdaslar?q=nebiyev2', { kuki })).json;
    assert.deepEqual(tapilan.map((e) => [e.id, e.hr_duzelib]), [[id, 1]]);
    assert.equal((await yaz('/api/emekdaslar/yoxdur', { ad: 'A', soyad: 'B' }, kuki, 'PUT')).status, 404);
    assert.equal((await yaz(`/api/emekdaslar/${id}`, { ad: '', soyad: 'B' }, kuki, 'PUT')).status, 400);

    // link və QR
    const l = await yaz(`/api/emekdaslar/${id}/sekil-link`, {}, kuki);
    assert.equal(l.status, 200);
    assert.match(l.json.url, /\/sekil\/[A-Za-z0-9_-]{43}$/);
    assert.ok(l.json.url.startsWith(url));
    assert.match(l.json.qr, /^data:image\/svg\+xml;base64,/);
    assert.match(Buffer.from(l.json.qr.split(',')[1], 'base64').toString(), /<svg/);
    assert.equal(l.json.yerli, true);
    assert.ok(l.json.bitir > Date.now());
    const v = (await sorgu(`/api/emekdaslar/${id}/sekil-link`, { kuki })).json;
    assert.deepEqual([v.aciq, v.istifade], [true, null]);
    assert.equal((await yaz('/api/emekdaslar/yoxdur/sekil-link', {}, kuki)).status, 404);

    // kompüterdən şəkil
    const sekil = (govde, tip = 'image/jpeg') => fetch(`${url}/api/emekdaslar/${id}/sekil`, { method: 'POST',
      headers: { Cookie: kuki, 'X-Aztu': '1', 'Content-Type': tip }, body: govde });
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 5)]);
    assert.equal((await sekil(jpeg)).status, 200);
    const c = await fetch(`${url}/api/emekdaslar/${id}/sekil`, { headers: { Cookie: kuki } });
    assert.deepEqual(Buffer.from(await c.arrayBuffer()), jpeg);
    const png = await sekil(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    assert.equal(png.status, 400);
    assert.match((await png.json()).xeta, /JPEG/);
    assert.equal((await sekil(Buffer.alloc(6 * 1024 * 1024, 0xff))).status, 413);

    // silmə: siyahıdan çıxır, kart qalır (aktiv 0), sonrakı redaktə və link 404
    assert.equal((await yaz(`/api/emekdaslar/${id}`, {}, kuki, 'DELETE')).status, 200);
    assert.ok(!(await sorgu('/api/emekdaslar', { kuki })).json.some((e) => e.id === id));
    const kart = await sorgu(`/api/emekdaslar/${id}`, { kuki });
    assert.deepEqual([kart.status, kart.json.aktiv], [200, 0]);
    assert.equal((await yaz(`/api/emekdaslar/${id}`, { ad: 'A', soyad: 'B' }, kuki, 'PUT')).status, 404);
    assert.equal((await yaz(`/api/emekdaslar/${id}/sekil-link`, {}, kuki)).status, 404);
    assert.equal((await yaz(`/api/emekdaslar/${id}`, {}, kuki, 'DELETE')).status, 404);
  } finally {
    if (id) {
      db.prepare('DELETE FROM sekil_linkleri WHERE emekdas_id = ?').run(id);
      db.prepare('DELETE FROM emekdas_qrafik WHERE emekdas_id = ?').run(id);
      db.prepare('DELETE FROM emekdaslar WHERE id = ?').run(id);
    }
  }
});

test('telefon şəkil linki: girişsiz, bir dəfəlik', async () => {
  const kuki = await giris();
  const id = (await yaz('/api/emekdaslar', { ad: 'Səbinə', soyad: 'Qasımlı', vezife: 'Mühəndis' }, kuki)).json.id;
  const linkAl = async () => (await yaz(`/api/emekdaslar/${id}/sekil-link`, {}, kuki)).json.url.split('/sekil/')[1];
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 2)]);
  const gonder = (token, govde, tip = 'image/jpeg') => fetch(`${url}/api/v1/sekil/${token}`, { method: 'POST',
    headers: { 'Content-Type': tip }, body: govde });
  try {
    const token = await linkAl();
    const sehife = await fetch(`${url}/sekil/${token}`);
    assert.equal(sehife.status, 200);
    assert.match(sehife.headers.get('content-type'), /html/);
    assert.equal(sehife.headers.get('cache-control'), 'no-store');
    const info = await sorgu(`/api/v1/sekil/${token}`);                    // kukisiz
    assert.equal(info.status, 200);
    assert.deepEqual(info.json, { ad: 'Səbinə', soyad: 'Qasımlı' });         // başqa sahə yoxdur

    assert.equal((await gonder(token, jpeg)).status, 200);
    const v = (await sorgu(`/api/emekdaslar/${id}/sekil-link`, { kuki })).json;
    assert.equal(v.aciq, false);
    assert.ok(v.istifade);
    const c = await fetch(`${url}/api/emekdaslar/${id}/sekil`, { headers: { Cookie: kuki } });
    assert.deepEqual(Buffer.from(await c.arrayBuffer()), jpeg);
    const tekrar = await gonder(token, jpeg);
    assert.equal(tekrar.status, 410);
    const tj = await tekrar.json();
    assert.equal(tj.istifade, true);                                         // telefon "qəbul olunub" göstərir
    assert.match(tj.xeta, /artıq qəbul olunub/);
    const sonra = await sorgu(`/api/v1/sekil/${token}`);
    assert.deepEqual([sonra.status, sonra.json.istifade], [410, true]);

    const yeni = await linkAl();
    const png = await gonder(yeni, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    assert.equal(png.status, 400);
    assert.ok([400, 415].includes((await gonder(yeni, jpeg, 'text/plain')).status));
    assert.equal((await gonder(yeni, Buffer.alloc(6 * 1024 * 1024, 0xff))).status, 413);
    assert.equal((await sorgu('/api/v1/sekil/yoxdur-token')).status, 404);
    assert.equal((await gonder('yoxdur-token', jpeg)).status, 404);

    await yaz(`/api/emekdaslar/${id}`, {}, kuki, 'DELETE');
    assert.equal((await sorgu(`/api/v1/sekil/${yeni}`)).status, 410);
    assert.equal((await gonder(yeni, jpeg)).status, 410);
  } finally {
    db.prepare('DELETE FROM sekil_linkleri WHERE emekdas_id = ?').run(id);
    db.prepare('DELETE FROM emekdaslar WHERE id = ?').run(id);
  }
});

test('silinən kadrın keçmiş hadisələri hesabatda qalır', async () => {
  const kuki = await giris();
  const id = (await yaz('/api/emekdaslar', { ad: 'Rəna', soyad: 'Kərimli' }, kuki)).json.id;
  db.prepare("UPDATE emekdaslar SET yaradilib = '2026-10-01 00:00:00' WHERE id = ?").run(id);
  db.prepare(`INSERT INTO hadiseler (id, tarix, saat, kamera, istiqamet, kateqoriya, emekdas_id, alindi)
    VALUES ('sil-1', '2026-10-15', '09:05:00', 'T1', 'giris', 'emekdas', ?, '')`).run(id);
  try {
    await yaz(`/api/emekdaslar/${id}`, {}, kuki, 'DELETE');
    const h = (await sorgu('/api/hesabat?bas=2026-10-01&son=2026-10-31', { kuki })).json;
    const x = h.xulase.find((e) => e.id === id);
    assert.ok(x, 'silinən kadr keçmiş ayın hesabatında olmalıdır');
    assert.equal(x.gelenGun, 1);
    const bos = (await sorgu('/api/hesabat?bas=2026-09-01&son=2026-09-30', { kuki })).json;
    assert.ok(!bos.xulase.some((e) => e.id === id));                         // hadisəsi olmayan dövrdə yoxdur
    const c = await fetch(`${url}/api/hesabat/excel?bas=2026-10-01&son=2026-10-31`, { headers: { Cookie: kuki } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await c.arrayBuffer()));
    let var_ = false;
    wb.worksheets[0].eachRow((r) => { if (r.values.includes('Kərimli')) var_ = true; });
    assert.ok(var_, 'Excel-də də olmalıdır');
  } finally {
    db.prepare("DELETE FROM hadiseler WHERE id = 'sil-1'").run();
    db.prepare('DELETE FROM sekil_linkleri WHERE emekdas_id = ?').run(id);
    db.prepare('DELETE FROM emekdaslar WHERE id = ?').run(id);
  }
});
