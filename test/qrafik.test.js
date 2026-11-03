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
