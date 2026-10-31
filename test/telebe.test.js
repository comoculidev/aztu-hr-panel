// Tələbə əməkdaş siyahısına düşməsin: qayda (kamera ilə eyni), serverdə təmizləmə.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bazaAc } from '../src/db.js';
import { telebedir, telebeleriSil, telebeleriTap } from '../src/telebe.js';

test('qayda: vəzifədə rəqəm / tələbə sözü, şöbədə qrup kodu', () => {
  for (const v of ['STUDENT', 'Student', 'Telebe', 'MAGISTR', 'M225A4']) assert.equal(telebedir('ITT', v), true, v);
  for (const s of ['5226a', 'M225A4', '615A5', 'BA-25', '651i']) assert.equal(telebedir(s, 'MEXANIKA-MUHENDISLIYI'), true, s);
  for (const s of ['Kompyuter texnologiyalari', 'ITT', 'Kafedra 2', 'Tədris şöbəsi', 'IT-2 bolmesi', '']) {
    assert.equal(telebedir(s, 'DOSENT'), false, s);
  }
  assert.equal(telebedir('5226a', ''), false);      // vəzifə boşdur — bilinmir
});

test('təmizləmə: tələbənin adı silinir, keçidləri adsız tələbə keçidi olur, əməkdaşa toxunulmur', () => {
  const db = bazaAc(':memory:');
  const emekdas = db.prepare(`INSERT INTO emekdaslar (id, ad, soyad, sobe, vezife, aktiv, yaradilib, yenilenib)
    VALUES (?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-01')`);
  emekdas.run('ali', 'Əli', 'Vəliyev', 'Kibertəhlükəsizlik', 'Dosent', 1);
  emekdas.run('nigar', 'Nigar', 'Həsənova', '5226a', 'MEXANIKA-MUHENDISLIYI', 0);
  emekdas.run('tural', 'Tural', 'Qasımov', 'ITT', 'STUDENT', 1);
  const hadise = db.prepare(`INSERT INTO hadiseler (id, tarix, saat, kamera, istiqamet, kateqoriya, emekdas_id, oxsarliq, alindi)
    VALUES (?, '2026-10-30', ?, 'T1', 'giris', 'emekdas', ?, 0.6, '2026-10-30')`);
  hadise.run('h1', '09:00:00', 'ali');
  hadise.run('h2', '09:01:00', 'nigar');
  hadise.run('h3', '09:02:00', 'nigar');
  hadise.run('h4', '09:03:00', 'tural');

  const tapilan = telebeleriTap(db);
  assert.deepEqual(tapilan.map((e) => [e.id, e.hadise]).sort(), [['nigar', 2], ['tural', 1]]);
  assert.deepEqual(telebeleriSil(db, tapilan.map((e) => e.id)), { emekdas: 2, hadise: 3 });

  assert.deepEqual(db.prepare('SELECT id FROM emekdaslar').all().map((e) => e.id), ['ali']);
  const h = db.prepare('SELECT id, kateqoriya, emekdas_id, oxsarliq FROM hadiseler ORDER BY id').all().map((x) => ({ ...x }));
  assert.deepEqual(h, [
    { id: 'h1', kateqoriya: 'emekdas', emekdas_id: 'ali', oxsarliq: 0.6 },
    { id: 'h2', kateqoriya: 'telebe', emekdas_id: null, oxsarliq: null },
    { id: 'h3', kateqoriya: 'telebe', emekdas_id: null, oxsarliq: null },
    { id: 'h4', kateqoriya: 'telebe', emekdas_id: null, oxsarliq: null },
  ]);
  assert.deepEqual(telebeleriTap(db), []);
  db.close();
});
