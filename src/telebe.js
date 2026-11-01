// Tələbə əməkdaş siyahısına düşməsin. Kamera sistemindəki aztu_uz/hesabat.py kateqoriya() ilə eyni qayda:
//   - vəzifədə (kameranın "qrup" sahəsi) rəqəm və ya tələbə sözü varsa — tələbə;
//   - şöbə (kameranın "ixtisas" sahəsi) tam qrup koduna oxşayırsa (5226a, M225A4) — tələbə: bazada sütunlar
//     yerini dəyişib, qrup kodu ixtisas yerinə düşüb.
// Kamera artıq tələbəni göndərmir. Bu yoxlama köhnə versiyalı kamera üçün və serverdə əvvəl yığılmış qeydləri
// təmizləmək üçündür. Tələbənin adı HR serverində olmamalıdır.

import { emeliyyat } from './db.js';

const TELEBE_SOZLERI = ['TELEBE', 'TƏLƏBƏ', 'STUDENT', 'MAGISTR', 'BAKALAVR', 'DOKTORANT'];
const QRUP_KODU = /^[A-ZƏÖÜĞIİŞÇ]{0,3}-?\d{2,4}[A-ZƏÖÜĞIİŞÇ]{0,2}\d?$/u;
// toUpperCase "i"-ni "I" edir (Python ilə eyni); tr/az locale lazım deyil — sözlər ASCII və "Ə" ilədir
const boyuk = (s) => String(s ?? '').trim().toUpperCase();

// Tələbə statusu: ən çoxu 2 söz, biri tələbə sözü ilə başlayır (TELEBE, STUDENTS, ECNEBI-TELEBE). Söz uzun vəzifə
// adının içindədirsə ("TEHSIL-TELEBE-KREDIT-MUTEXESSISI") — tələbələrlə işləyən əməkdaşdır.
function telebeSozu(v) {
  const sozler = v.split(/[\s\-_/]+/u).filter(Boolean);
  return sozler.length <= 2 && sozler.some((s) => TELEBE_SOZLERI.some((t) => s.startsWith(t)));
}

export function telebedir(sobe, vezife) {
  const v = boyuk(vezife);
  if (!v || v === '—' || v === '-') return false;     // vəzifə boşdur — bilinmir, kamera onsuz da göndərmir
  if (/\d/.test(v) || telebeSozu(v)) return true;
  return QRUP_KODU.test(boyuk(sobe));
}

/** Serverdəki əməkdaş siyahısında tələbəyə oxşayanlar: [{id, ad, soyad, sobe, vezife, aktiv, hadise}] */
export function telebeleriTap(db) {
  const say = db.prepare('SELECT COUNT(*) AS n FROM hadiseler WHERE emekdas_id = ?');
  return db.prepare('SELECT id, ad, soyad, sobe, vezife, aktiv FROM emekdaslar').all()
    .filter((e) => telebedir(e.sobe, e.vezife))
    .map((e) => ({ ...e, hadise: say.get(e.id).n }));
}

/**
 * Tələbələrin adı, şəkli silinir. Keçidləri qalır, amma adsız "tələbə" keçidi olur (kamera tələbəni elə də göndərir):
 * ümumi saylar dəyişmir. Qaytarır: { emekdas, hadise } — silinən adam və adsızlaşdırılan keçid sayı.
 */
export function telebeleriSil(db, idler) {
  const adsiz = db.prepare(`UPDATE hadiseler SET kateqoriya = 'telebe', emekdas_id = NULL, oxsarliq = NULL
    WHERE emekdas_id = ?`);
  const sil = db.prepare('DELETE FROM emekdaslar WHERE id = ?');
  let emekdas = 0;
  let hadise = 0;
  emeliyyat(db, () => {
    for (const id of idler) {
      hadise += Number(adsiz.run(id).changes);
      emekdas += Number(sil.run(id).changes);
    }
  });
  return { emekdas, hadise };
}
