// Axtarış Azərbaycan hərfləri ilə və onlarsız: "Eli" = "Əli" = "Ali", "huseyn" = "Hüseyn".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formalar, sozler, uygundur } from '../src/axtaris.js';

const metn = formalar('Əli', 'Vəliyev', 'Hüseyn', 'Kibertəhlükəsizlik', 'Dosent');

test('diakritiksiz və ə = e / a', () => {
  for (const s of ['Eli', 'əli', 'ali', 'veliyev ali', 'HÜSEYN', 'huseyn', 'kibertehlukesizlik', 'dos']) {
    assert.ok(uygundur(sozler(s), metn), s);
  }
});

test('hər söz olmalıdır', () => {
  assert.ok(!uygundur(sozler('ali məmmədov'), metn));
  assert.deepEqual(sozler('  İsmayıl   Şükürov '), ['ismayil', 'sukurov']);
});
