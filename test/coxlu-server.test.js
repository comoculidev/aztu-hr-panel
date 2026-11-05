// Bir neçə kamera serveri (INGEST_IP=A,B): əməkdaş siyahısı və siqnal serverə görə ayrılır, bir-birini silmir.
// Serverlərin IP-si X-Forwarded-For ilə verilir (PROXY_ETIBAR: loopback-dən gələn başlığa etibar olunur).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { appQur } from '../src/app.js';
import { istifadeciYaz } from '../src/auth.js';
import { bazaAc } from '../src/db.js';
import { SIQNAL, siqnalCemi, siqnallariOxu } from '../src/ingest.js';

const sakit = { info() {}, warn() {}, error() {} };
const ACAR = randomBytes(24).toString('base64url');
const PAROL = randomBytes(12).toString('base64url');
const A = '192.0.2.77';
const B = '192.0.2.78';
const k = { ingestAcar: ACAR, ingestIp: [A, B], isBaslama: '09:00', isBitme: '18:00', sessiyaSaat: 8,
  tehlukesizKuki: false, proxyEtibar: true };

let db;
let server;
let url;

async function sorgu(yol, { metod = 'GET', govde, basliq = {} } = {}) {
  const c = await fetch(url + yol, {
    method: metod,
    headers: { ...(govde ? { 'Content-Type': 'application/json' } : {}), ...basliq },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  return { status: c.status, c, json: (c.headers.get('content-type') || '').includes('json') ? await c.json() : null };
}
const ingest = (ip, yol, govde) => sorgu(`/api/v1/ingest/${yol}`, {
  metod: 'POST', govde, basliq: { Authorization: `Bearer ${ACAR}`, 'X-Forwarded-For': ip } });
const emekdas = (id) => ({ id, ad: id, soyad: 'Sınaq', sobe: 'Kibertəhlükəsizlik', vezife: 'Dosent' });
const aktivler = () => db.prepare('SELECT id FROM emekdaslar WHERE aktiv = 1 ORDER BY id').all().map((e) => e.id);

before(async () => {
  db = bazaAc(':memory:');
  istifadeciYaz(db, 'hr.sinaq', PAROL, 'hr');
  server = appQur(db, k, sakit).listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); });

test('icazəsiz server (siyahıda olmayan IP) rədd edilir', async () => {
  assert.equal((await ingest('192.0.2.99', 'siqnal', {})).status, 403);
});

test('əməkdaş: bir server o birinin əməkdaşlarını deaktiv etmir', async () => {
  assert.equal((await ingest(A, 'emekdaslar', { emekdaslar: [emekdas('ali'), emekdas('leyla')] })).json.deaktiv, 0);
  assert.equal((await ingest(B, 'emekdaslar', { emekdaslar: [emekdas('ali'), emekdas('samir')] })).json.deaktiv, 0);
  assert.deepEqual(aktivler(), ['ali', 'leyla', 'samir']);          // əvvəl B-nin siyahısı leyla-nı deaktiv edirdi

  // A-nın bazasından leyla çıxdı: yalnız A onu göndərirdi — deaktiv; samir (B-nindir) toxunulmur
  assert.equal((await ingest(A, 'emekdaslar', { emekdaslar: [emekdas('ali')] })).json.deaktiv, 1);
  assert.deepEqual(aktivler(), ['ali', 'samir']);

  // B-nin bazası boşaldı: samir deaktiv, ali isə A-da hələ var — aktiv qalır
  assert.equal((await ingest(B, 'emekdaslar', { emekdaslar: [] })).json.deaktiv, 1);
  assert.deepEqual(aktivler(), ['ali']);

  // B samir-i yenidən göndərsə, yenə aktiv olur
  await ingest(B, 'emekdaslar', { emekdaslar: [emekdas('samir')] });
  assert.deepEqual(aktivler(), ['ali', 'samir']);
});

test('əməkdaş: INGEST_IP-dən çıxarılan serverin köhnə siyahısı əməkdaşı aktiv saxlamır', async () => {
  await ingest(A, 'emekdaslar', { emekdaslar: [emekdas('ali'), emekdas('nermin')] });
  db.prepare('INSERT INTO emekdas_menbe (emekdas_id, menbe) VALUES (?, ?)').run('nermin', '192.0.2.99');
  await ingest(A, 'emekdaslar', { emekdaslar: [emekdas('ali')] });   // .99 artıq siyahıda deyil — onun qeydi silinir
  assert.ok(!aktivler().includes('nermin'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM emekdas_menbe WHERE menbe = '192.0.2.99'").get().n, 0);
});

test('siqnal: hər server ayrıca, biri susanda panel bunu görür', async () => {
  // köhnə versiyanın tək qeydi yeniləmədən sonra da oxunur, ilk yeni siqnalla silinir
  db.prepare("INSERT INTO sistem (acar, deyer) VALUES ('siqnal', ?)")
    .run(JSON.stringify({ ip: A, alindi: '2026-11-06 09:00:00', alindiMs: Date.now(), kameralar: [{ ad: 'T1' }] }));
  assert.deepEqual(siqnallariOxu(db, k).map((s) => s.ip), [A]);

  await ingest(A, 'siqnal', { kameralar: [{ ad: 'T1', istiqamet: 'giris' }], versiya: 'v1', novbe: 2 });
  await ingest(B, 'siqnal', { kameralar: [{ ad: 'T5', istiqamet: 'cixis' }], versiya: 'v1', novbe: 3, taninmayan_sekli: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sistem WHERE acar = 'siqnal'").get().n, 0);

  const g = await sorgu('/api/giris', { metod: 'POST', govde: { ad: 'hr.sinaq', parol: PAROL } });
  const kuki = g.c.headers.get('set-cookie').split(';')[0];
  let u = (await sorgu('/api/umumi', { basliq: { Cookie: kuki } })).json;
  assert.deepEqual(u.siqnallar.map((s) => [s.ip, s.onlayn]), [[A, true], [B, true]]);
  assert.deepEqual([u.siqnal.onlayn, u.siqnal.serverSay, u.siqnal.onlaynSay, u.siqnal.novbe], [true, 2, 2, 5]);
  assert.deepEqual(u.siqnal.kameralar.map((x) => x.ad), ['T1', 'T5']);

  // B 10 dəqiqədir susur: cəmi oflayn, amma A hələ onlayn
  const b = JSON.parse(db.prepare('SELECT deyer FROM sistem WHERE acar = ?').get(SIQNAL + B).deyer);
  b.alindiMs -= 10 * 60_000;
  db.prepare('UPDATE sistem SET deyer = ? WHERE acar = ?').run(JSON.stringify(b), SIQNAL + B);
  u = (await sorgu('/api/umumi', { basliq: { Cookie: kuki } })).json;
  assert.deepEqual(u.siqnallar.map((s) => [s.ip, s.onlayn]), [[A, true], [B, false]]);
  assert.deepEqual([u.siqnal.onlayn, u.siqnal.onlaynSay], [false, 1]);
});

test('siqnal: INGEST_IP boşdursa 7 gündür susan server siyahıdan çıxır; şəkil vəziyyətinin cəmi', () => {
  const t = Date.now();
  const d = bazaAc(':memory:');
  const yaz = (ip, ms, sekil) => d.prepare('INSERT INTO sistem (acar, deyer) VALUES (?, ?)')
    .run(SIQNAL + ip, JSON.stringify({ ip, alindi: 'x', alindiMs: ms, taninmayanSekli: sekil }));
  yaz(A, t, true);
  yaz(B, t - 8 * 24 * 3600_000, false);
  assert.deepEqual(siqnallariOxu(d, { ingestIp: [] }, t).map((s) => s.ip), [A]);
  assert.deepEqual(siqnallariOxu(d, { ingestIp: [A, B] }, t).map((s) => s.ip), [A, B]);   // siyahıdadırsa qalır
  assert.equal(siqnalCemi(siqnallariOxu(d, { ingestIp: [A, B] }, t)).taninmayanSekli, false);
  assert.equal(siqnalCemi([]), null);
  d.close();
});
