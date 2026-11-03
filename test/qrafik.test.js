// İş qrafiki: şablonlar, tarixli təyinat, şablon saatının tarixçəsi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bazaAc } from '../src/db.js';

test('baza açılanda 6 şablon yaranır, təkrar açanda ikiqat olmur', () => {
  const db = bazaAc(':memory:');
  assert.deepEqual(db.prepare('SELECT acar FROM qrafik_sablonlari ORDER BY sira').all().map((x) => x.acar),
    ['tam_1', 'stat_075', 'stat_05', 'stat_025', 'qisaldilmis', 'natamam']);
  const s = db.prepare(`SELECT s.bas, s.baslama, s.bitme, s.kim FROM sablon_saatlari s
    JOIN qrafik_sablonlari q ON q.id = s.sablon_id WHERE q.acar = 'tam_1'`).all();
  assert.deepEqual(s.map((x) => ({ ...x })), [{ bas: '2000-01-01', baslama: '09:00', bitme: '17:30', kim: 'sistem' }]);
  db.close();

  const qovluq = mkdtempSync(path.join(tmpdir(), 'hr-qrafik-'));
  try {
    const yol = path.join(qovluq, 'hr.db');
    bazaAc(yol).close();
    const db2 = bazaAc(yol);
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM qrafik_sablonlari').get().n, 6);
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM sablon_saatlari').get().n, 6);
    db2.close();
  } finally {
    rmSync(qovluq, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Task 2: qrafikin tapılması
import { buGun, indiYaz } from '../src/db.js';
import { SorguXetasi } from '../src/hesabat.js';
import { qrafikTap, qrafikXeritesi, qrafikYaz, sablonSaatYaz, saatYoxla } from '../src/qrafik.js';

const K = { isBaslama: '09:00', isBitme: '18:00' };

function baza(...ids) {
  const db = bazaAc(':memory:');
  const yaz = db.prepare(`INSERT INTO emekdaslar (id, ad, soyad, axtaris, yaradilib, yenilenib) VALUES (?, ?, '', '', ?, ?)`);
  for (const id of ids) yaz.run(id, id, indiYaz(), indiYaz());
  return db;
}
const sid = (db, acar) => db.prepare('SELECT id FROM qrafik_sablonlari WHERE acar = ?').get(acar).id;
const qisa = (q) => [q.isBaslama, q.isBitme, q.ad];

test('təyinat yoxdursa .env saatı', () => {
  const db = baza('a');
  assert.deepEqual(qrafikTap(db, K, 'a', '2026-11-02'),
    { isBaslama: '09:00', isBitme: '18:00', ad: 'Standart', menbe: null, sablonId: null });
});

test('tarixli təyinat: dəyişiklikdən əvvəlki gün köhnə qrafiklə', () => {
  const db = baza('a');
  qrafikYaz(db, { emekdasId: 'a', bas: '2026-10-01', sablonId: sid(db, 'tam_1'), menbe: 'excel', kim: 't' });
  qrafikYaz(db, { emekdasId: 'a', bas: '2026-11-01', sablonId: sid(db, 'stat_05'), menbe: 'excel', kim: 't' });
  assert.deepEqual(qisa(qrafikTap(db, K, 'a', '2026-10-31')), ['09:00', '17:30', 'Tam, 1 ştat']);
  assert.deepEqual(qisa(qrafikTap(db, K, 'a', '2026-11-01')), ['09:00', '13:00', 'Tam, 0,5 ştat']);
  assert.deepEqual(qisa(qrafikTap(db, K, 'a', '2026-09-30')), ['09:00', '18:00', 'Standart']);
});

test('şablon saatının tarixçəsi', () => {
  const db = baza('a');
  qrafikYaz(db, { emekdasId: 'a', bas: '2026-10-01', sablonId: sid(db, 'tam_1'), menbe: 'excel', kim: 't' });
  sablonSaatYaz(db, { sablonId: sid(db, 'tam_1'), bas: '2026-11-03', baslama: '08:30', bitme: '17:00', kim: 't' });
  assert.deepEqual(qisa(qrafikTap(db, K, 'a', '2026-11-02')), ['09:00', '17:30', 'Tam, 1 ştat']);
  assert.deepEqual(qisa(qrafikTap(db, K, 'a', '2026-11-03')), ['08:30', '17:00', 'Tam, 1 ştat']);
});

test('fərdi saat', () => {
  const db = baza('a');
  qrafikYaz(db, { emekdasId: 'a', bas: '2026-10-01', baslama: '10:00', bitme: '15:00', menbe: 'el', kim: 't' });
  const q = qrafikTap(db, K, 'a', '2026-10-05');
  assert.deepEqual([...qisa(q), q.menbe, q.sablonId], ['10:00', '15:00', 'Fərdi', 'el', null]);
});

test('eyni gün iki dəyişiklik: ikincisi əvəz edir', () => {
  const db = baza('a');
  qrafikYaz(db, { emekdasId: 'a', bas: '2026-10-01', sablonId: sid(db, 'tam_1'), menbe: 'excel', kim: 't' });
  qrafikYaz(db, { emekdasId: 'a', bas: '2026-10-01', baslama: '10:00', bitme: '15:00', menbe: 'el', kim: 't' });
  assert.deepEqual(qisa(qrafikTap(db, K, 'a', '2026-10-01')), ['10:00', '15:00', 'Fərdi']);
  sablonSaatYaz(db, { sablonId: sid(db, 'tam_1'), bas: '2026-10-01', baslama: '08:00', bitme: '17:00', kim: 't' });
  sablonSaatYaz(db, { sablonId: sid(db, 'tam_1'), bas: '2026-10-01', baslama: '08:15', bitme: '17:00', kim: 't' });
  assert.equal(db.prepare("SELECT baslama FROM sablon_saatlari WHERE bas = '2026-10-01'").get().baslama, '08:15');
});

test('gələcək tarixli təyinat bu günü dəyişmir', () => {
  const db = baza('a');
  const sabah = new Date();
  sabah.setDate(sabah.getDate() + 1);
  qrafikYaz(db, { emekdasId: 'a', bas: buGun(sabah), sablonId: sid(db, 'stat_05'), menbe: 'el', kim: 't' });
  assert.equal(qrafikTap(db, K, 'a', buGun()).ad, 'Standart');
  assert.equal(qrafikTap(db, K, 'a', buGun(sabah)).ad, 'Tam, 0,5 ştat');
});

test('xəritə aralıqdan əvvəlki təyinatı görür və qrafikTap ilə eynidir', () => {
  const db = baza('a', 'b', 'c');
  qrafikYaz(db, { emekdasId: 'a', bas: '2026-10-01', sablonId: sid(db, 'tam_1'), menbe: 'excel', kim: 't' });
  qrafikYaz(db, { emekdasId: 'a', bas: '2026-11-01', sablonId: sid(db, 'stat_05'), menbe: 'excel', kim: 't' });
  qrafikYaz(db, { emekdasId: 'b', bas: '2026-10-28', baslama: '10:00', bitme: '15:00', menbe: 'el', kim: 't' });
  sablonSaatYaz(db, { sablonId: sid(db, 'tam_1'), bas: '2026-10-27', baslama: '08:30', bitme: '17:00', kim: 't' });
  const x = qrafikXeritesi(db, K, ['a', 'b', 'c'], '2026-10-25', '2026-11-05');
  for (const id of ['a', 'b', 'c']) {
    for (let d = 25; d <= 36; d += 1) {
      const t = d <= 31 ? `2026-10-${d}` : `2026-11-0${d - 31}`;
      assert.deepEqual(x(id, t), qrafikTap(db, K, id, t), `${id} ${t}`);
    }
  }
});

test('saatYoxla', () => {
  assert.throws(() => saatYoxla('17:30', '09:00'), SorguXetasi);
  assert.throws(() => saatYoxla('9:00', '17:00'), SorguXetasi);
  assert.throws(() => saatYoxla('09:00', '09:00'), SorguXetasi);
  assert.doesNotThrow(() => saatYoxla('09:00', '17:30'));
});
