// Hesabat: gəlməyən iş günləri və Azərbaycan əlifbası ilə sıralama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bazaAc, indiYaz } from '../src/db.js';
import { emekdasSec, hesabatQur } from '../src/hesabat.js';

const k = { isBaslama: '09:00', isBitme: '18:00' };

function baza(adamlar) {
  const db = bazaAc(':memory:');
  const yaz = db.prepare(`INSERT INTO emekdaslar (id, ad, soyad, axtaris, yaradilib, yenilenib) VALUES (?, ?, ?, '', ?, ?)`);
  for (const [id, ad, soyad] of adamlar) yaz.run(id, ad, soyad, indiYaz(), indiYaz());
  return db;
}

test('əməkdaş siyahıya sonra düşsə də, ilk hadisəsindən sonrakı gəlmədiyi iş günü sayılır', () => {
  const db = baza([['a', 'Əli', 'Vəliyev']]);      // yaradilib = bu gün, hadisələr isə köhnədir (növbədən gəlib)
  const h = db.prepare(`INSERT INTO hadiseler (id, tarix, saat, kamera, istiqamet, kateqoriya, emekdas_id, alindi)
                        VALUES (?, ?, ?, 'T1', ?, 'emekdas', 'a', '')`);
  h.run('1', '2026-10-26', '09:00:00', 'giris');   // bazar ertəsi
  h.run('2', '2026-10-26', '18:00:00', 'cixis');
  h.run('3', '2026-10-28', '09:00:00', 'giris');   // çərşənbə; çərşənbə axşamı (27) gəlməyib
  const { setirler, xulase } = hesabatQur(db, k, emekdasSec(db), '2026-10-25', '2026-10-28');
  assert.deepEqual(setirler.map((s) => [s.tarix, s.veziyyet]),
    [['2026-10-26', 'geldi'], ['2026-10-27', 'gelmeyib'], ['2026-10-28', 'geldi']]);
  assert.equal(xulase[0].gelmeyenGun, 1);
  assert.equal(xulase[0].gelenGun, 2);
});

test('siyahı Azərbaycan əlifbası ilə: Ə, İ, Ş öz yerində', () => {
  const db = baza([['1', 'Səbinə', 'İsmayılova'], ['2', 'Nigar', 'Əliyeva'], ['3', 'Tural', 'Babayev'],
    ['4', 'Aysel', 'Həsənova'], ['5', 'Rəşad', 'Şirinov'], ['6', 'Orxan', 'Zeynalov']]);
  assert.deepEqual(emekdasSec(db).map((e) => e.soyad), ['Babayev', 'Əliyeva', 'Həsənova', 'İsmayılova', 'Şirinov', 'Zeynalov']);
});
