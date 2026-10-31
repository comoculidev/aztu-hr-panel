// Giriş (login): parol scrypt ilə, sessiya tokeni təsadüfi, bazada yalnız tokenin heşi saxlanır.
// Qeydiyyat səhifəsi yoxdur: istifadəçiləri server administratoru yaradır (npm run istifadeci).
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { indiYaz } from './db.js';

const SCRYPT = { N: 16384, r: 8, p: 1 };

export function parolHash(parol) {
  const duz = randomBytes(16);
  const h = scryptSync(parol, duz, 32, SCRYPT);
  return `scrypt$${duz.toString('hex')}$${h.toString('hex')}`;
}

export function parolYoxla(parol, saxlanan) {
  const [nov, duz, h] = String(saxlanan).split('$');
  if (nov !== 'scrypt' || !duz || !h) return false;
  const yeni = scryptSync(parol, Buffer.from(duz, 'hex'), 32, SCRYPT);
  const kohne = Buffer.from(h, 'hex');
  return kohne.length === yeni.length && timingSafeEqual(kohne, yeni);
}

export const ROLLAR = ['admin', 'hr'];

export function istifadeciYaz(db, ad, parol, rol = 'hr') {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(ad)) throw new Error('İstifadəçi adı 3-32 simvol: hərf, rəqəm, . _ -');
  if (String(parol).length < 10) throw new Error('Parol ən azı 10 simvol olmalıdır');
  if (!ROLLAR.includes(rol)) throw new Error(`Rol: ${ROLLAR.join(' və ya ')}`);
  const h = parolHash(parol);
  db.prepare(`INSERT INTO istifadeciler (ad, parol, rol, yaradilib) VALUES (?, ?, ?, ?)
              ON CONFLICT(ad) DO UPDATE SET parol = excluded.parol, rol = excluded.rol, aktiv = 1`)
    .run(ad, h, rol, indiYaz());
  // parol dəyişəndə köhnə sessiyalar bağlanır
  db.prepare('DELETE FROM sessiyalar WHERE istifadeci_id = (SELECT id FROM istifadeciler WHERE ad = ?)').run(ad);
}

const tokenHash = (t) => createHash('sha256').update(t).digest('hex');

export function sessiyaAc(db, istifadeciId, saat) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessiyalar WHERE bitir < ?').run(Date.now());
  db.prepare('INSERT INTO sessiyalar (token_hash, istifadeci_id, bitir) VALUES (?, ?, ?)')
    .run(tokenHash(token), istifadeciId, Date.now() + saat * 3600_000);
  return token;
}

export function sessiyaTap(db, token) {
  if (!token) return null;
  return db.prepare(`SELECT i.id, i.ad, i.rol FROM sessiyalar s JOIN istifadeciler i ON i.id = s.istifadeci_id
                     WHERE s.token_hash = ? AND s.bitir > ? AND i.aktiv = 1`).get(tokenHash(token), Date.now()) ?? null;
}

export const sessiyaBagla = (db, token) => token && db.prepare('DELETE FROM sessiyalar WHERE token_hash = ?').run(tokenHash(token));

export function kukiOxu(req, ad) {
  for (const hisse of (req.headers.cookie || '').split(';')) {
    const i = hisse.indexOf('=');
    if (i > 0 && hisse.slice(0, i).trim() === ad) return decodeURIComponent(hisse.slice(i + 1).trim());
  }
  return null;
}

/** Parolu təxmin etməyə qarşı: eyni IP + ad üçün 5 səhv cəhd → 15 dəqiqə blok */
export class GirisLimiti {
  constructor(maks = 5, blokDeq = 15) {
    this.maks = maks;
    this.blokMs = blokDeq * 60_000;
    this.cehdler = new Map();
  }

  blokdur(acar) {
    const c = this.cehdler.get(acar);
    if (!c) return 0;
    if (c.blok && c.blok > Date.now()) return Math.ceil((c.blok - Date.now()) / 60_000);
    if (c.blok) this.cehdler.delete(acar);
    return 0;
  }

  sehv(acar) {
    const c = this.cehdler.get(acar) ?? { say: 0, blok: 0 };
    c.say += 1;
    if (c.say >= this.maks) c.blok = Date.now() + this.blokMs;
    this.cehdler.set(acar, c);
  }

  ugurlu(acar) {
    this.cehdler.delete(acar);
  }
}
