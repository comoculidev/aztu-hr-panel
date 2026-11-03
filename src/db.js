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
-- iş qrafiki: şablonlar, şablon saatının tarixçəsi, əməkdaşa təyinatın tarixçəsi (dəyişiklik tarixlə qüvvəyə minir —
-- köhnə günlər köhnə saatla hesablanır), kadr Excel-indən gələn məlumat (FİN, doğum tarixi saxlanmır)
CREATE TABLE IF NOT EXISTS qrafik_sablonlari (
  id INTEGER PRIMARY KEY, acar TEXT NOT NULL UNIQUE, ad TEXT NOT NULL, sira INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sablon_saatlari (
  sablon_id INTEGER NOT NULL REFERENCES qrafik_sablonlari(id),
  bas TEXT NOT NULL, baslama TEXT NOT NULL, bitme TEXT NOT NULL,
  kim TEXT NOT NULL, yaradilib TEXT NOT NULL,
  PRIMARY KEY (sablon_id, bas)
);
CREATE TABLE IF NOT EXISTS emekdas_qrafik (
  emekdas_id TEXT NOT NULL REFERENCES emekdaslar(id),
  bas TEXT NOT NULL,
  sablon_id INTEGER REFERENCES qrafik_sablonlari(id),   -- şablon VƏ YA fərdi saat
  baslama TEXT, bitme TEXT,
  menbe TEXT NOT NULL,                                  -- 'excel' | 'el'
  kim TEXT NOT NULL, yaradilib TEXT NOT NULL,
  PRIMARY KEY (emekdas_id, bas)
);
CREATE TABLE IF NOT EXISTS kadr_melumati (
  emekdas_id TEXT NOT NULL REFERENCES emekdaslar(id),
  sira INTEGER NOT NULL,                                -- 0 = qrafik götürülən (Əsas) sətir
  muessise TEXT, vezife TEXT, isci_qrup TEXT, tip TEXT, stat REAL, is_vaxti TEXT,
  yuklenib TEXT NOT NULL,
  PRIMARY KEY (emekdas_id, sira)
);
`;

/** Başlanğıc şablonlar (HR ilə razılaşdırılıb, 03.11.2026); saatlara nahar fasiləsi daxildir. Sonra paneldən dəyişir. */
export const SABLONLAR = [
  { acar: 'tam_1', ad: 'Tam, 1 ştat', baslama: '09:00', bitme: '17:30' },
  { acar: 'stat_075', ad: 'Tam, 0,75 ştat', baslama: '09:00', bitme: '16:00' },
  { acar: 'stat_05', ad: 'Tam, 0,5 ştat', baslama: '09:00', bitme: '13:00' },
  { acar: 'stat_025', ad: 'Tam, 0,25 ştat', baslama: '09:00', bitme: '11:00' },
  { acar: 'qisaldilmis', ad: 'Qısaldılmış', baslama: '09:00', bitme: '16:30' },
  { acar: 'natamam', ad: 'Natamam', baslama: '09:00', bitme: '13:00' },
];

/** Şablon yoxdursa yaradır (ilk saatı 2000-01-01-dən); varsa toxunmur — HR-in dəyişdiyi saat qorunur. */
function sablonlariYaz(db) {
  const indi = indiYaz();
  const yaz = db.prepare('INSERT OR IGNORE INTO qrafik_sablonlari (acar, ad, sira) VALUES (?, ?, ?)');
  const saat = db.prepare(`INSERT OR IGNORE INTO sablon_saatlari (sablon_id, bas, baslama, bitme, kim, yaradilib)
    SELECT id, '2000-01-01', ?, ?, 'sistem', ? FROM qrafik_sablonlari WHERE acar = ?`);
  emeliyyat(db, () => SABLONLAR.forEach((s, i) => {
    if (yaz.run(s.acar, s.ad, i).changes) saat.run(s.baslama, s.bitme, indi, s.acar);
  }));
}

export function bazaAc(yol) {
  if (yol !== ':memory:') mkdirSync(path.dirname(yol), { recursive: true });
  const db = new DatabaseSync(yol);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SXEM);
  // köhnə bazaya yeni sütunlar (sonradan əlavə olunanlar) — mövcud məlumat itmir
  sutunElave(db, 'hadiseler', 'adam_no', 'TEXT');     // tanınmayanın qlobal nömrəsi (G7)
  sutunElave(db, 'hadiseler', 'sekil', 'BLOB');       // tanınmayanın kameradakı üzü (30 gün)
  sablonlariYaz(db);
  return db;
}

function sutunElave(db, cedvel, sutun, tip) {
  const var_ = db.prepare(`PRAGMA table_info(${cedvel})`).all().some((s) => s.name === sutun);
  if (!var_) db.exec(`ALTER TABLE ${cedvel} ADD COLUMN ${sutun} ${tip}`);
}

/** Tanınmayanların üz şəkilləri yalnız `gun` gün saxlanır (şəxsi məlumat); hadisənin özü qalır. Silinən sayı. */
export function kohneSekilleriSil(db, gun = 30) {
  const d = new Date();
  d.setDate(d.getDate() - gun);
  return Number(db.prepare('UPDATE hadiseler SET sekil = NULL WHERE sekil IS NOT NULL AND tarix < ?')
    .run(buGun(d)).changes);
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
