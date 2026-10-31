// Kamera sistemindən gələn məlumat (aztu_uz/hr_server.py): hadisələr, əməkdaş siyahısı, şəkillər, siqnal.
// Yalnız Bearer açarı düz olan və icazəli IP-dən (INGEST_IP) gələn sorğu qəbul edilir.
import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { formalar } from './axtaris.js';
import { emeliyyat, indiYaz } from './db.js';
import { telebedir } from './telebe.js';

const TARIX = /^\d{4}-\d{2}-\d{2}$/;
const SAAT = /^\d{2}:\d{2}:\d{2}$/;
const KATEQORIYA = new Set(['emekdas', 'telebe', 'taninmayan', 'diger']);
const metn = (v, maks = 200) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');

export const ipNormal = (ip) => String(ip || '').replace(/^::ffff:/, '');

/** base64 → JPEG (yalnız FF D8 ilə başlayan və ağlabatan ölçüdə; başqa fayl brauzerə şəkil kimi verilməsin) */
export function jpegOxu(b64, maks = 500_000) {
  if (typeof b64 !== 'string' || !b64 || b64.length > maks * 1.4) return null;
  const b = Buffer.from(b64, 'base64');
  return b.length >= 100 && b.length <= maks && b[0] === 0xff && b[1] === 0xd8 ? b : null;
}

function eyniAcar(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function ingestRouter(db, k, log = console) {
  const r = express.Router();
  r.use(express.json({ limit: '25mb' }));

  r.use((req, res, next) => {
    if (!k.ingestAcar) return res.status(503).json({ xeta: 'INGEST_ACAR təyin edilməyib' });
    const ip = ipNormal(req.ip);
    if (k.ingestIp.length && !k.ingestIp.includes(ip)) {
      log.warn(`ingest: icazəsiz IP ${ip}`);
      return res.status(403).json({ xeta: 'IP icazəli deyil' });
    }
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m || !eyniAcar(m[1], k.ingestAcar)) {
      log.warn(`ingest: səhv açar (${ip})`);
      return res.status(401).json({ xeta: 'açar səhvdir' });
    }
    next();
  });

  const hadiseYaz = db.prepare(`INSERT OR IGNORE INTO hadiseler
    (id, tarix, saat, kamera, istiqamet, kateqoriya, emekdas_id, oxsarliq, adam_no, sekil, alindi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  r.post('/hadiseler', (req, res) => {
    const siyahi = req.body?.hadiseler;
    if (!Array.isArray(siyahi) || siyahi.length > 500) return res.status(400).json({ xeta: 'hadiseler: 1-500 elementli siyahı' });
    const alindi = indiYaz();
    let qebul = 0;
    let pozuq = 0;
    emeliyyat(db, () => {
      for (const h of siyahi) {
        const id = metn(h?.id, 64);
        if (!id || !TARIX.test(h.tarix) || !SAAT.test(h.saat) || !['giris', 'cixis'].includes(h.istiqamet)
            || !KATEQORIYA.has(h.kateqoriya)) {
          pozuq += 1;
          continue;
        }
        const emekdasId = h.kateqoriya === 'emekdas' ? metn(h.emekdas_id, 300) || null : null;
        const oxs = typeof h.oxsarliq === 'number' && Number.isFinite(h.oxsarliq) ? h.oxsarliq : null;
        // üz şəkli yalnız tanınmayan üçün saxlanır (HR "Hadisələr"); əməkdaş/tələbə şəkli gəlsə də yazılmır
        const taninmayan = h.kateqoriya === 'taninmayan';
        qebul += Number(hadiseYaz.run(id, h.tarix, h.saat, metn(h.kamera, 32) || '?', h.istiqamet, h.kateqoriya,
          emekdasId, oxs, taninmayan ? metn(h.adam_no, 16) || null : null, taninmayan ? jpegOxu(h.sekil) : null,
          alindi).changes);
      }
    });
    // pozuq hadisə təkrar göndərilsə də düzəlməyəcək — 200 qaytarılır ki, kamera növbəsi ilişib qalmasın
    if (pozuq) log.warn(`ingest: ${pozuq} pozuq hadisə atıldı`);
    res.json({ qebul, tekrar: siyahi.length - qebul - pozuq, pozuq });
  });

  r.post('/emekdaslar', (req, res) => {
    const siyahi = req.body?.emekdaslar;
    if (!Array.isArray(siyahi)) return res.status(400).json({ xeta: 'emekdaslar siyahı olmalıdır' });
    const indi = indiYaz();
    const movcud = new Map(db.prepare('SELECT id, sekil_hash, aktiv FROM emekdaslar').all().map((e) => [e.id, e]));
    const yaz = db.prepare(`INSERT INTO emekdaslar (id, ad, soyad, ata, sobe, vezife, aktiv, gozlenen_hash, axtaris, yaradilib, yenilenib)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET ad = excluded.ad, soyad = excluded.soyad, ata = excluded.ata, sobe = excluded.sobe,
        vezife = excluded.vezife, aktiv = 1, gozlenen_hash = excluded.gozlenen_hash, axtaris = excluded.axtaris,
        yenilenib = excluded.yenilenib`);
    const gelen = new Set();
    const sekilLazim = [];
    let yeni = 0;
    let telebe = 0;
    emeliyyat(db, () => {
      for (const e of siyahi) {
        const id = metn(e?.id, 300);
        const ad = metn(e?.ad, 100);
        if (!id || !ad || gelen.has(id)) continue;
        const [soyad, ata, sobe, vezife] = [metn(e.soyad, 100), metn(e.ata, 100), metn(e.sobe), metn(e.vezife)];
        // köhnə versiyalı kamera tələbəni də göndərə bilər — qəbul edilmir (siyahıda yox sayılır, varsa deaktiv olur)
        if (telebedir(sobe, vezife)) {
          telebe += 1;
          continue;
        }
        gelen.add(id);
        const hash = metn(e.sekil_hash, 80);
        yaz.run(id, ad, soyad, ata, sobe, vezife, hash, formalar(ad, soyad, ata, sobe, vezife), indi, indi);
        const kohne = movcud.get(id);
        if (!kohne) yeni += 1;
        if (hash && (!kohne || kohne.sekil_hash !== hash)) sekilLazim.push(id);
      }
      // siyahıda olmayanlar kamera bazasından çıxıb: silinmir (keçmiş hadisələri hesabatda qalsın), deaktiv olur
      const deaktivEt = db.prepare('UPDATE emekdaslar SET aktiv = 0, yenilenib = ? WHERE id = ?');
      for (const [id, e] of movcud) if (!gelen.has(id) && e.aktiv) deaktivEt.run(indi, id);
    });
    const deaktiv = [...movcud.entries()].filter(([id, e]) => !gelen.has(id) && e.aktiv).length;
    log.info(`ingest: əməkdaş siyahısı — ${gelen.size} nəfər, ${yeni} yeni, ${deaktiv} deaktiv, ${sekilLazim.length} şəkil lazım`
      + (telebe ? `, ${telebe} tələbə qəbul edilmədi (kamera yenilənməlidir)` : ''));
    res.json({ yeni, yenilenen: gelen.size - yeni, deaktiv, telebe, sekil_lazim: sekilLazim });
  });

  r.post('/sekiller', (req, res) => {
    const siyahi = req.body?.sekiller;
    if (!Array.isArray(siyahi) || siyahi.length > 50) return res.status(400).json({ xeta: 'sekiller: ən çox 50' });
    const yaz = db.prepare('UPDATE emekdaslar SET sekil = ?, sekil_hash = gozlenen_hash WHERE id = ?');
    let qebul = 0;
    emeliyyat(db, () => {
      for (const s of siyahi) {
        const jpeg = Buffer.from(metn(s?.jpeg, 2_000_000), 'base64');
        // yalnız JPEG (FF D8) və ağlabatan ölçü — başqa fayl brauzerə şəkil kimi verilməsin
        if (jpeg.length < 100 || jpeg.length > 1_000_000 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) continue;
        qebul += Number(yaz.run(jpeg, metn(s.id, 300)).changes);
      }
    });
    res.json({ qebul });
  });

  r.post('/siqnal', (req, res) => {
    const b = req.body || {};
    const deyer = {
      alindi: indiYaz(), alindiMs: Date.now(), ip: ipNormal(req.ip), vaxt: metn(b.vaxt, 40), novbe: Number(b.novbe) || 0,
      versiya: metn(b.versiya, 40),
      kameralar: Array.isArray(b.kameralar)
        ? b.kameralar.slice(0, 100).map((c) => ({ ad: metn(c?.ad, 32), istiqamet: metn(c?.istiqamet, 10) })) : [],
    };
    db.prepare('INSERT INTO sistem (acar, deyer) VALUES (?, ?) ON CONFLICT(acar) DO UPDATE SET deyer = excluded.deyer')
      .run('siqnal', JSON.stringify(deyer));
    res.json({ ok: true });
  });

  return r;
}
