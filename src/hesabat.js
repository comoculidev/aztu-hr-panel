// Əməkdaş × gün cədvəli və əməkdaş üzrə xülasə: panelin "Əməkdaş" kartı, "Hesabat" səhifəsi və Excel eyni funksiyanı
// işlədir — ekranda görünən rəqəmlə Excel-dəki rəqəm həmişə eynidir.
import { sozler } from './axtaris.js';
import { buGun, indiYaz } from './db.js';
import { gunHesabla, gunler, isGunudur, saatYaz, saniye } from './davamiyyet.js';

const TARIX = /^\d{4}-\d{2}-\d{2}$/;
export const HEFTE = ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'];
export const hefteGunu = (t) => HEFTE[new Date(`${t}T00:00:00Z`).getUTCDay()];

export class SorguXetasi extends Error {}

/** ?bas=&son= → yoxlanmış aralıq (standart: bu gün); ən çox 366 gün */
export function araliq(q) {
  const bugun = buGun();
  const bas = q.bas || bugun;
  const son = q.son || bas;
  // format və həqiqi tarix (2026-13-01, 2026-02-30 kimi günlər yoxdur)
  const duzdur = (t) => {
    const d = new Date(`${t}T00:00:00Z`);
    return TARIX.test(t) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
  };
  if (!duzdur(bas) || !duzdur(son)) throw new SorguXetasi('Tarix YYYY-MM-DD şəklində olmalıdır');
  if (bas > son) throw new SorguXetasi('Başlanğıc tarixi sondan sonra ola bilməz');
  if ((new Date(son) - new Date(bas)) / 86400_000 > 366) throw new SorguXetasi('Aralıq ən çox 1 il ola bilər');
  return { bas, son };
}

/** Əməkdaşları süzür: q (ad, soyad, ata adı, şöbə, vəzifə — diakritiksiz), şöbə, vəzifə, id */
export function emekdasSec(db, { q = '', sobe = '', vezife = '', emekdas = '', hamisi = false } = {}) {
  const sert = [];
  const par = [];
  if (!hamisi && !emekdas) sert.push('aktiv = 1');
  if (emekdas) { sert.push('id = ?'); par.push(emekdas); }
  if (sobe) { sert.push('sobe = ?'); par.push(sobe); }
  if (vezife) { sert.push('vezife = ?'); par.push(vezife); }
  for (const s of sozler(q).slice(0, 8)) { sert.push("axtaris LIKE ? ESCAPE '\\'"); par.push(`%${s.replace(/[\\%_]/g, '\\$&')}%`); }
  const where = sert.length ? `WHERE ${sert.join(' AND ')}` : '';
  // SQLite "Ə", "İ", "Ş"-ni Z-dən sonra qoyur — sıralama Azərbaycan əlifbası ilə JS-də
  return db.prepare(`SELECT id, ad, soyad, ata, sobe, vezife, aktiv, sekil IS NOT NULL AS sekil_var, yaradilib
                     FROM emekdaslar ${where}`).all(...par)
    .sort((a, b) => AZ.compare(a.soyad, b.soyad) || AZ.compare(a.ad, b.ad) || AZ.compare(a.ata, b.ata));
}

export const AZ = new Intl.Collator('az', { sensitivity: 'base' });

/** {emekdas_id: {tarix: [hadisə]}} — bir sorğu ilə (hər əməkdaş üçün ayrıca sorğu yox) */
export function hadiseXeritesi(db, ids, bas, son) {
  const x = new Map(ids.map((id) => [id, new Map()]));
  if (!ids.length) return x;
  const sorgu = db.prepare(`SELECT emekdas_id, tarix, saat, istiqamet, kamera FROM hadiseler
                            WHERE kateqoriya = 'emekdas' AND tarix BETWEEN ? AND ? ORDER BY tarix, saat`);
  for (const h of sorgu.iterate(bas, son)) {
    const gunlerX = x.get(h.emekdas_id);
    if (!gunlerX) continue;
    if (!gunlerX.has(h.tarix)) gunlerX.set(h.tarix, []);
    gunlerX.get(h.tarix).push(h);
  }
  return x;
}

/** Bir əməkdaşın bir günü: gəliş, çıxış, işdə olma/olmama, gecikmə və vəziyyət */
export function gunSetri(tarix, hadiseler, k, bugun = buGun(), indiSaat = indiYaz().slice(11)) {
  const g = gunHesabla(hadiseler, { isBaslama: k.isBaslama, isBitme: k.isBitme, indi: tarix === bugun ? indiSaat : null });
  let veziyyet = 'geldi';
  if (!hadiseler.length) veziyyet = isGunudur(tarix) ? (tarix === bugun ? 'gozlenilir' : 'gelmeyib') : 'istirahet';
  return { tarix, hefte: hefteGunu(tarix), veziyyet, ...g };
}

/**
 * Əməkdaşlar × günlər. Hadisəsi olmayan iş günü "gəlməyib" sətri olur (əməkdaş sistemə düşəndən sonrakı keçmiş
 * günlər üçün); hadisəsiz şənbə-bazar göstərilmir.
 */
export function hesabatQur(db, k, emekdaslar, bas, son) {
  const bugun = buGun();
  const indiSaat = indiYaz().slice(11);
  const xerite = hadiseXeritesi(db, emekdaslar.map((e) => e.id), bas, son);
  const setirler = [];
  const xulase = [];
  const butunGunler = gunler(bas, son);
  for (const e of emekdaslar) {
    const gunX = xerite.get(e.id);
    // "gəlməyib" yalnız əməkdaşı sistem tanıyandan sonra: siyahıya düşdüyü gün və ya ilk hadisəsi (hansı əvvəldirsə)
    const ilkHadise = gunX.keys().next().value;
    const yaradilib = (e.yaradilib || '').slice(0, 10);
    const ilkGun = ilkHadise && ilkHadise < yaradilib ? ilkHadise : yaradilib;
    const x = {
      id: e.id, ad: e.ad, soyad: e.soyad, ata: e.ata, sobe: e.sobe, vezife: e.vezife, aktiv: e.aktiv,
      gelenGun: 0, gelmeyenGun: 0, isdeSan: 0, olmamaSan: 0, gecikmeSayi: 0, gecikmeSan: 0, natamamGun: 0,
      ortaGelis: null,
    };
    let gelisCem = 0;
    for (const tarix of butunGunler) {
      const hadiseler = gunX.get(tarix) ?? [];
      if (!hadiseler.length && (!isGunudur(tarix) || tarix > bugun || tarix < ilkGun)) continue;
      const s = gunSetri(tarix, hadiseler, k, bugun, indiSaat);
      if (s.veziyyet === 'gozlenilir') continue;    // bu gün, hələ gəlməyib — "gəlməyib" demək tezdir
      setirler.push({ emekdas: e.id, ad: e.ad, soyad: e.soyad, ata: e.ata, sobe: e.sobe, vezife: e.vezife, ...s });
      if (s.veziyyet === 'gelmeyib') { x.gelmeyenGun += 1; continue; }
      x.gelenGun += 1;
      gelisCem += saniye(s.gelis);
      x.isdeSan += s.isdeSan ?? 0;
      x.olmamaSan += s.olmamaSan;
      if (s.gecikmeSan > 0) { x.gecikmeSayi += 1; x.gecikmeSan += s.gecikmeSan; }
      if (s.qeydler.length) x.natamamGun += 1;
    }
    if (x.gelenGun) x.ortaGelis = saatYaz(gelisCem / x.gelenGun).slice(0, 5);
    xulase.push(x);
  }
  return { setirler, xulase };
}
