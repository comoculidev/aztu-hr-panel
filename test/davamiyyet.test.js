// İş vaxtı qaydası: günün ilk girişi = gəliş, son çıxışı = çıxış, gün içindəki çıxış → giriş boşluqları = işdə olmama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunHesabla, muddetYaz, saniye, gunler, isGunudur } from '../src/davamiyyet.js';

const h = (saat, istiqamet, kamera = 'T1') => ({ saat, istiqamet, kamera });
const ayar = { isBaslama: '09:00', isBitme: '18:00' };

test('sadə gün: gəliş və çıxış', () => {
  const g = gunHesabla([h('09:05:00', 'giris'), h('18:10:00', 'cixis')], ayar);
  assert.equal(g.gelis, '09:05:00');
  assert.equal(g.cixis, '18:10:00');
  assert.equal(g.olmamaSan, 0);
  assert.equal(g.isdeSan, 9 * 3600 + 5 * 60);
  assert.equal(g.gecikmeSan, 5 * 60);
  assert.equal(g.erkenCixisSan, 0);
  assert.equal(g.binadadir, false);
  assert.deepEqual(g.qeydler, []);
});

test('istifadəçinin nümunəsi: 9:00 giriş, 14:00 çıxış, 15:00 qayıdış — gün içində çıxış sayılmır', () => {
  const g = gunHesabla([h('09:00:00', 'giris'), h('14:00:00', 'cixis'), h('15:00:00', 'giris'),
    h('18:00:00', 'cixis')], ayar);
  assert.equal(g.gelis, '09:00:00');
  assert.equal(g.cixis, '18:00:00');
  assert.equal(g.olmamaSan, 3600);
  assert.equal(g.isdeSan, 8 * 3600);
  assert.deepEqual(g.bosluqlar, [{ cixis: '14:00:00', qayitma: '15:00:00', san: 3600 }]);
});

test('sıra fərq etmir, bir neçə kamera eyni keçidi iki dəfə yazırsa bir sayılır', () => {
  const g = gunHesabla([h('18:00:00', 'cixis'), h('09:00:20', 'giris', 'T2'), h('09:00:00', 'giris', 'T1')], ayar);
  assert.equal(g.gelis, '09:00:00');
  assert.equal(g.kecidSayi, 2);
});

test('çıxış qeydə alınmayıb (keçmiş gün): iş vaxtı hesablanmır, son görünmə göstərilir', () => {
  const g = gunHesabla([h('09:00:00', 'giris'), h('12:00:00', 'cixis'), h('13:00:00', 'giris')], ayar);
  assert.equal(g.cixis, null);
  assert.equal(g.isdeSan, null);
  assert.equal(g.sonGorunme, '13:00:00');
  assert.equal(g.olmamaSan, 3600);
  assert.match(g.qeydler.join(), /çıxış qeydə alınmayıb/);
});

test('bu gün, hələ binadadır: iş vaxtı indiyə qədər', () => {
  const g = gunHesabla([h('09:00:00', 'giris')], { ...ayar, indi: '11:30:00' });
  assert.equal(g.binadadir, true);
  assert.equal(g.cixis, null);
  assert.equal(g.isdeSan, 2.5 * 3600);
  assert.deepEqual(g.qeydler, []);
});

test('giriş yoxdur: ilk hadisə gəliş sayılır və qeyd yazılır', () => {
  const g = gunHesabla([h('09:10:00', 'cixis'), h('17:00:00', 'cixis')], ayar);
  assert.equal(g.gelis, '09:10:00');
  assert.equal(g.cixis, '17:00:00');
  assert.match(g.qeydler.join(), /giriş qeydə alınmayıb/);
});

test('çöldə ikinci çıxış: arada giriş görünməyib — boşluq hesablanmır', () => {
  const g = gunHesabla([h('09:00:00', 'giris'), h('12:00:00', 'cixis'), h('17:00:00', 'cixis')], ayar);
  assert.equal(g.cixis, '17:00:00');
  assert.equal(g.olmamaSan, 0);
  assert.equal(g.isdeSan, 8 * 3600);
  assert.match(g.qeydler.join(), /giriş qeydə alınmayıb/);
});

test('içəridə ikinci giriş sayılmır, erkən çıxış hesablanır', () => {
  const g = gunHesabla([h('08:50:00', 'giris'), h('10:00:00', 'giris'), h('16:00:00', 'cixis')], ayar);
  assert.equal(g.gecikmeSan, 0);
  assert.equal(g.erkenCixisSan, 2 * 3600);
  assert.equal(g.isdeSan, (16 * 60 - 8 * 60 - 50) * 60);
});

test('boş gün', () => {
  const g = gunHesabla([], ayar);
  assert.equal(g.gelis, null);
  assert.equal(g.isdeSan, null);
  assert.equal(g.kecidSayi, 0);
});

test('köməkçilər', () => {
  assert.equal(muddetYaz(3600 * 8 + 5 * 60), '8:05');
  assert.equal(muddetYaz(null), '—');
  assert.equal(saniye('01:02:03'), 3723);
  assert.deepEqual(gunler('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(isGunudur('2026-10-31'), false);   // şənbə
  assert.equal(isGunudur('2026-11-02'), true);    // bazar ertəsi
});
