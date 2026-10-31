// Verilənlər bazası: SQLite (Node-un daxili node:sqlite modulu — yerli kompilyasiya, ayrıca server lazım deyil).
// 30 kamera və bir neçə min əməkdaş üçün kifayətdir; lazım olsa PostgreSQL-ə keçid yalnız bu faylı və sorğuları dəyişir.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SXEM = `
CREATE TABLE IF NOT EXISTS emekdaslar (
  id TEXT PRIMARY KEY,                -- kamera sistemindəki şəxs açarı (ad|soyad|ata|vəzifə|şöbə, sadələşdirilmiş)
  ad TEXT NOT NULL, soyad TEXT NOT NULL DEFAULT '', ata TEXT NOT NULL DEFAULT '',
  sobe TEXT NOT NULL DEFAULT '', vezife TEXT NOT NULL DEFAULT '',
  aktiv INTEGER NOT NULL DEFAULT 1,   -- kamera bazasından çıxanda 0 (keçmiş hadisələri qalır)
  sekil BLOB, sekil_hash TEXT, gozlenen_hash TEXT,
  axtaris TEXT NOT NULL DEFAULT '',   -- axtaris.formalar(): diakritiksiz iki forma
  yaradilib TEXT NOT NULL, yenilenib TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hadiseler (
  no INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,            -- kameranın verdiyi id: təkrar göndərmə ikiqat yazılmır
  tarix TEXT NOT NULL, saat TEXT NOT NULL,           -- kamera kompüterinin yerli vaxtı (Bakı)
  kamera TEXT NOT NULL, istiqamet TEXT NOT NULL,     -- giris | cixis
  kateqoriya TEXT NOT NULL,           -- emekdas | telebe | taninmayan | diger
  emekdas_id TEXT, oxsarliq REAL, alindi TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS hadise_tarix ON hadiseler(tarix, saat);
CREATE INDEX IF NOT EXISTS hadise_emekdas ON hadiseler(emekdas_id, tarix, saat);
CREATE TABLE IF NOT EXISTS istifadeciler (
  id INTEGER PRIMARY KEY, ad TEXT NOT NULL UNIQUE, parol TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'hr', aktiv INTEGER NOT NULL DEFAULT 1, yaradilib TEXT NOT NULL, son_giris TEXT
);
CREATE TABLE IF NOT EXISTS sessiyalar (
  token_hash TEXT PRIMARY KEY,
  istifadeci_id INTEGER NOT NULL REFERENCES istifadeciler(id) ON DELETE CASCADE,
  bitir INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sistem (acar TEXT PRIMARY KEY, deyer TEXT NOT NULL);
`;

export function bazaAc(yol) {
  if (yol !== ':memory:') mkdirSync(path.dirname(yol), { recursive: true });
  const db = new DatabaseSync(yol);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SXEM);
  return db;
}

/** Yerli vaxt "YYYY-MM-DD HH:MM:SS" (server TZ=Asia/Baku) */
export function indiYaz(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const buGun = (d = new Date()) => indiYaz(d).slice(0, 10);

/** Bir neçə yazını bir əməliyyatda (sürət və yarımçıq yazı olmasın deyə) */
export function emeliyyat(db, f) {
  db.exec('BEGIN');
  try {
    const n = f();
    db.exec('COMMIT');
    return n;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
