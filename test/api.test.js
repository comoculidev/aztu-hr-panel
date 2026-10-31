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
  assert.equal(g.getRow(2).getCell(9).value, '08:55:00');
  const basliq = g.getRow(1).values.slice(1);
  assert.ok(basliq.includes('Kənarda (cəmi)') && basliq.includes('Kənarda olduğu vaxtlar'));
  assert.equal(g.getRow(2).getCell(basliq.indexOf('Kənarda (cəmi)') + 1).value, '0 dəq');
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
