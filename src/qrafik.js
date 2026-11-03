// Əməkdaşın iş qrafiki: hansı gün hansı saat (başlama/bitmə). Dəyişikliklər tarixlə qüvvəyə minir: həm əməkdaşa
// təyinat (emekdas_qrafik), həm şablonun saatı (sablon_saatlari) — keçmiş günlər həmişə o günkü saatla hesablanır,
// ona görə qrafik dəyişəndə köhnə hesabatların rəqəmləri dəyişmir. Təyinat yoxdursa .env-dəki ümumi saat (köhnə
// davranış).
import { indiYaz } from './db.js';
import { SorguXetasi } from './hesabat.js';

export const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** HH:MM formatı və başlama < bitmə; səhvdə SorguXetasi (API 400 qaytarır) */
export function saatYoxla(baslama, bitme) {
  if (!SAAT.test(String(baslama)) || !SAAT.test(String(bitme))) throw new SorguXetasi('Saat SS:DD şəklində olmalıdır');
  if (baslama >= bitme) throw new SorguXetasi('Başlama saatı bitmədən əvvəl olmalıdır');
}

/** sıralı [{bas, ...}] siyahısında `tarix`-də qüvvədə olan (bas <= tarix olan sonuncu) element */
function quvvede(siyahi, tarix) {
  let netice = null;
  for (const x of siyahi) {
    if (x.bas > tarix) break;
    netice = x;
  }
  return netice;
}

function sablonlarOxu(db) {
  const sablonlar = new Map(db.prepare('SELECT id, ad FROM qrafik_sablonlari').all().map((s) => [s.id, { ad: s.ad, saatlar: [] }]));
  for (const s of db.prepare('SELECT sablon_id, bas, baslama, bitme FROM sablon_saatlari ORDER BY bas').iterate()) {
    sablonlar.get(s.sablon_id)?.saatlar.push(s);
  }
  return sablonlar;
}

function hellEt(k, sablonlar, teyinatlar, tarix) {
  const t = teyinatlar ? quvvede(teyinatlar, tarix) : null;
  if (!t) return { isBaslama: k.isBaslama, isBitme: k.isBitme, ad: 'Standart', menbe: null, sablonId: null };
  if (t.sablon_id === null) return { isBaslama: t.baslama, isBitme: t.bitme, ad: 'Fərdi', menbe: t.menbe, sablonId: null };
  const s = sablonlar.get(t.sablon_id);
  // şablonun ilk saatı 2000-01-01-dəndir, ona görə saat həmişə tapılır
  const saat = quvvede(s.saatlar, tarix) ?? s.saatlar[0];
  return { isBaslama: saat.baslama, isBitme: saat.bitme, ad: s.ad, menbe: t.menbe, sablonId: t.sablon_id };
}

/**
 * Bir neçə əməkdaş və aralıq üçün qrafik funksiyası: (emekdasId, tarix) → {isBaslama, isBitme, ad, menbe, sablonId}.
 * Bütün sətirlər iki sorğu ilə əvvəlcədən oxunur (hesabatda əməkdaş × gün başına sorğu olmasın). Aralıqdan əvvəl
 * qüvvəyə minmiş təyinat da lazımdır, ona görə `bas`-dan əvvəlkilər də oxunur (siyahılar qısadır).
 */
export function qrafikXeritesi(db, k, ids, bas, son) {
  const sablonlar = sablonlarOxu(db);
  const teyinat = new Map();
  if (ids.length) {
    const ist = new Set(ids);
    for (const t of db.prepare(`SELECT emekdas_id, bas, sablon_id, baslama, bitme, menbe FROM emekdas_qrafik
                                WHERE bas <= ? ORDER BY bas`).iterate(son)) {
      if (!ist.has(t.emekdas_id)) continue;
      if (!teyinat.has(t.emekdas_id)) teyinat.set(t.emekdas_id, []);
      teyinat.get(t.emekdas_id).push(t);
    }
  }
  return (emekdasId, tarix) => hellEt(k, sablonlar, teyinat.get(emekdasId), tarix);
}

/** Tək əməkdaş, tək gün */
export function qrafikTap(db, k, emekdasId, tarix) {
  const teyinatlar = db.prepare(`SELECT bas, sablon_id, baslama, bitme, menbe FROM emekdas_qrafik
                                 WHERE emekdas_id = ? AND bas <= ? ORDER BY bas`).all(emekdasId, tarix);
  return hellEt(k, sablonlarOxu(db), teyinatlar, tarix);
}

/** Şablonun `tarix`-dəki saatı */
export function sablonSaati(db, sablonId, tarix) {
  const s = sablonlarOxu(db).get(sablonId);
  if (!s) return null;
  const saat = quvvede(s.saatlar, tarix) ?? s.saatlar[0];
  return { baslama: saat.baslama, bitme: saat.bitme };
}

/** Əməkdaşa təyinat: şablon (sablonId) VƏ YA fərdi saat. Eyni gün üçün yeni yazı köhnəni əvəz edir. */
export function qrafikYaz(db, { emekdasId, bas, sablonId = null, baslama = null, bitme = null, menbe, kim }) {
  if (sablonId === null) saatYoxla(baslama, bitme);
  db.prepare(`INSERT INTO emekdas_qrafik (emekdas_id, bas, sablon_id, baslama, bitme, menbe, kim, yaradilib)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(emekdas_id, bas) DO UPDATE SET sablon_id = excluded.sablon_id, baslama = excluded.baslama,
      bitme = excluded.bitme, menbe = excluded.menbe, kim = excluded.kim, yaradilib = excluded.yaradilib`)
    .run(emekdasId, bas, sablonId, sablonId === null ? baslama : null, sablonId === null ? bitme : null, menbe, kim, indiYaz());
}

/** Şablonun saatı `bas` tarixindən etibarən. Eyni gün üçün yeni yazı köhnəni əvəz edir. */
export function sablonSaatYaz(db, { sablonId, bas, baslama, bitme, kim }) {
  saatYoxla(baslama, bitme);
  db.prepare(`INSERT INTO sablon_saatlari (sablon_id, bas, baslama, bitme, kim, yaradilib) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(sablon_id, bas) DO UPDATE SET baslama = excluded.baslama, bitme = excluded.bitme, kim = excluded.kim,
      yaradilib = excluded.yaradilib`).run(sablonId, bas, baslama, bitme, kim, indiYaz());
}
