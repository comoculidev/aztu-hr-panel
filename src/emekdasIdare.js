// Kadr idarəsi: paneldən əlavə, redaktə, silmə və telefondan şəkil linki.
// Heç nə fiziki silinmir: keçmiş hadisələr hesabatda qalsın deyə silinən əməkdaş yalnız gizlədilir (silinib = 1).
// Şəkil yalnız paneldə saxlanır (hr_sekil) — kamera/üz tanıma sisteminə getmir.
import { createHash, randomBytes } from 'node:crypto';
import { formalar } from './axtaris.js';
import { emeliyyat, indiYaz } from './db.js';
import { SorguXetasi } from './hesabat.js';

/** Şəkil linkinin ömrü: 24 saat (istifadəçi ilə razılaşdırılıb) */
export const LINK_MS = 86_400_000;

const tokenHash = (t) => createHash('sha256').update(String(t)).digest('hex');

/** JPEG imzası (FF D8 FF): telefon səhifəsi canvas ilə həmişə JPEG göndərir, başqa formatı qəbul etmirik */
export const jpegdir = (buf) => Buffer.isBuffer(buf) && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

/** Formanın sahələri: ad, soyad məcburi (1–100), ata ≤100, şöbə və vəzifə ≤200; sətir olmayan dəyər boş sayılır */
export function sahelerOxu(govde) {
  if (!govde || typeof govde !== 'object') throw new SorguXetasi('Ad və soyad məcburidir');
  const al = (ad, maks) => {
    const v = typeof govde[ad] === 'string' ? govde[ad].trim().replace(/\s+/g, ' ') : '';
    if (v.length > maks) throw new SorguXetasi(`${ad}: ən çox ${maks} simvol`);
    return v;
  };
  const s = { ad: al('ad', 100), soyad: al('soyad', 100), ata: al('ata', 100), sobe: al('sobe', 200), vezife: al('vezife', 200) };
  if (!s.ad || !s.soyad) throw new SorguXetasi('Ad və soyad məcburidir');
  return s;
}

const axtaris = (s) => formalar(s.ad, s.soyad, s.ata, s.sobe, s.vezife);

/** Yeni kadr; id "el-" + 12 hex — kamera açarları (ad|soyad|...) ilə toqquşmur */
export function emekdasElave(db, govde) {
  const s = sahelerOxu(govde);
  const id = `el-${randomBytes(6).toString('hex')}`;
  const indi = indiYaz();
  db.prepare(`INSERT INTO emekdaslar (id, ad, soyad, ata, sobe, vezife, aktiv, menbe, axtaris, yaradilib, yenilenib)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'el', ?, ?, ?)`).run(id, s.ad, s.soyad, s.ata, s.sobe, s.vezife, axtaris(s), indi, indi);
  return id;
}

/** Redaktə: kameradan gələn əməkdaşda da işləyir — hr_duzelib = 1 olanda sinxron bu sahələri yazmır */
export function emekdasDeyis(db, id, govde) {
  const s = sahelerOxu(govde);
  const r = db.prepare(`UPDATE emekdaslar SET ad = ?, soyad = ?, ata = ?, sobe = ?, vezife = ?, axtaris = ?, hr_duzelib = 1,
    yenilenib = ? WHERE id = ? AND silinib = 0`).run(s.ad, s.soyad, s.ata, s.sobe, s.vezife, axtaris(s), indiYaz(), String(id));
  return r.changes === 1;
}

/** Silmə: gizlədilir (aktiv 0, silinib 1), açıq şəkil linkləri bağlanır */
export function emekdasSil(db, id) {
  return emeliyyat(db, () => {
    const r = db.prepare('UPDATE emekdaslar SET aktiv = 0, silinib = 1, yenilenib = ? WHERE id = ? AND silinib = 0')
      .run(indiYaz(), String(id));
    if (r.changes !== 1) return false;
    db.prepare('UPDATE sekil_linkleri SET bitir = 0 WHERE emekdas_id = ? AND istifade IS NULL').run(String(id));
    return true;
  });
}

/** Kompüterdən yüklənən şəkil */
export function sekilYaz(db, id, buf) {
  const r = db.prepare('UPDATE emekdaslar SET hr_sekil = ?, hr_sekil_vaxt = ? WHERE id = ? AND silinib = 0')
    .run(buf, indiYaz(), String(id));
  return r.changes === 1;
}

const movcuddur = (db, id) => Boolean(db.prepare('SELECT 1 FROM emekdaslar WHERE id = ? AND silinib = 0').get(String(id)));

/** Yeni link; əvvəlki açıq linklər bağlanır (bir kadrın bir açıq linki olur). Token yalnız bir dəfə qaytarılır. */
export function linkYarat(db, id, kim, indi = Date.now()) {
  return emeliyyat(db, () => {
    if (!movcuddur(db, id)) return null;
    db.prepare('UPDATE sekil_linkleri SET bitir = ? WHERE emekdas_id = ? AND istifade IS NULL AND bitir > ?').run(indi, String(id), indi);
    const token = randomBytes(32).toString('base64url');
    const bitir = indi + LINK_MS;
    db.prepare('INSERT INTO sekil_linkleri (token_hash, emekdas_id, kim, yaradilib, bitir) VALUES (?, ?, ?, ?, ?)')
      .run(tokenHash(token), String(id), String(kim), indiYaz(), bitir);
    return { token, bitir };
  });
}

/** Panel pəncərəsi üçün: ən son linkin vəziyyəti (şəkil gəlibmi) */
export function linkVeziyyeti(db, id, indi = Date.now()) {
  const l = db.prepare('SELECT bitir, istifade FROM sekil_linkleri WHERE emekdas_id = ? ORDER BY rowid DESC LIMIT 1').get(String(id));
  if (!l) return { aciq: false, bitir: null, istifade: null };
  return { aciq: !l.istifade && l.bitir > indi && movcuddur(db, id), bitir: l.bitir, istifade: l.istifade ?? null };
}

/** Telefon səhifəsi üçün: link var, bağlıdır, yoxsa açıqdır — açıqdırsa yalnız ad və soyad */
export function linkTap(db, token, indi = Date.now()) {
  const l = db.prepare(`SELECT l.bitir, l.istifade, e.id, e.ad, e.soyad, e.silinib FROM sekil_linkleri l
    JOIN emekdaslar e ON e.id = l.emekdas_id WHERE l.token_hash = ?`).get(tokenHash(token));
  if (!l) return { veziyyet: 'yox' };
  if (l.istifade || l.bitir <= indi || l.silinib) return { veziyyet: 'bagli' };
  return { veziyyet: 'aciq', emekdas: { id: l.id, ad: l.ad, soyad: l.soyad } };
}

/**
 * Telefondan gələn şəkil: linkin "istifade" yazılışı şərtlidir (açıq və müddəti keçməyib) — iki dəfə basılanda və ya
 * şəbəkə təkrar göndərəndə yalnız birinci yazılır, ikincisi 'bagli' alır.
 */
export function linkleSekilYaz(db, token, buf, indi = Date.now()) {
  return emeliyyat(db, () => {
    const h = tokenHash(token);
    const r = db.prepare(`UPDATE sekil_linkleri SET istifade = ? WHERE token_hash = ? AND istifade IS NULL AND bitir > ?
      AND emekdas_id IN (SELECT id FROM emekdaslar WHERE silinib = 0)`).run(indiYaz(), h, indi);
    if (r.changes !== 1) return db.prepare('SELECT 1 FROM sekil_linkleri WHERE token_hash = ?').get(h) ? 'bagli' : 'yox';
    const { emekdas_id: id } = db.prepare('SELECT emekdas_id FROM sekil_linkleri WHERE token_hash = ?').get(h);
    sekilYaz(db, id, buf);
    return 'yazildi';
  });
}
