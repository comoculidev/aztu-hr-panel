// Panelin API-si (brauzer üçün). /api/giris-dən başqa hamısı sessiya tələb edir.
import express from 'express';
import { GirisLimiti, kukiOxu, parolYoxla, sessiyaAc, sessiyaBagla, sessiyaTap } from './auth.js';
import { buGun, indiYaz } from './db.js';
import { excelYaz } from './excel.js';
import { AZ, SorguXetasi, araliq, emekdasSec, gunSetri, hesabatQur } from './hesabat.js';
import { ipNormal } from './ingest.js';

export const KUKI = 'aztu_hr';
const KATEQORIYA = new Set(['emekdas', 'telebe', 'taninmayan', 'diger']);
const SIQNAL_ONLAYN_MS = 3 * 60_000;     // kamera hər 60 san siqnal verir; 3 dəq yoxdursa — oflayn

const asinxron = (f) => (req, res, next) => Promise.resolve(f(req, res, next)).catch(next);
const str = (v, maks = 200) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');

export function apiRouter(db, k, log = console) {
  const r = express.Router();
  r.use(express.json({ limit: '50kb' }));
  const limit = new GirisLimiti();

  const kuki = (token, maxYas) => [`${KUKI}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxYas}`,
    ...(k.tehlukesizKuki ? ['Secure'] : [])].join('; ');

  r.post('/giris', (req, res) => {
    const ad = str(req.body?.ad, 64);
    const parol = typeof req.body?.parol === 'string' ? req.body.parol : '';
    const acar = `${ipNormal(req.ip)}|${ad.toLowerCase()}`;
    const blok = limit.blokdur(acar);
    if (blok) return res.status(429).json({ xeta: `Çox səhv cəhd. ${blok} dəqiqə sonra yenidən yoxlayın.` });
    const i = db.prepare('SELECT id, ad, rol, parol FROM istifadeciler WHERE ad = ? AND aktiv = 1').get(ad);
    if (!i || !parolYoxla(parol, i.parol)) {
      limit.sehv(acar);
      log.warn(`giriş uğursuz: "${ad}" (${ipNormal(req.ip)})`);
      return res.status(401).json({ xeta: 'İstifadəçi adı və ya parol səhvdir' });
    }
    limit.ugurlu(acar);
    db.prepare('UPDATE istifadeciler SET son_giris = ? WHERE id = ?').run(indiYaz(), i.id);
    res.setHeader('Set-Cookie', kuki(sessiyaAc(db, i.id, k.sessiyaSaat), k.sessiyaSaat * 3600));
    log.info(`giriş: ${i.ad} (${ipNormal(req.ip)})`);
    res.json({ ad: i.ad, rol: i.rol });
  });

  // ---------------------------------------------------------------- bundan sonra: sessiya
  r.use((req, res, next) => {
    req.istifadeci = sessiyaTap(db, kukiOxu(req, KUKI));
    if (!req.istifadeci) return res.status(401).json({ xeta: 'Sessiya bitib, yenidən daxil olun' });
    // dəyişiklik edən sorğular yalnız panelin öz JS-indən (SameSite kuki ilə birlikdə CSRF qorunması)
    if (req.method !== 'GET' && req.headers['x-aztu'] !== '1') return res.status(403).json({ xeta: 'icazəsiz sorğu' });
    next();
  });

  r.post('/cixis', (req, res) => {
    sessiyaBagla(db, kukiOxu(req, KUKI));
    res.setHeader('Set-Cookie', kuki('', 0));
    res.json({ ok: true });
  });

  r.get('/men', (req, res) => {
    res.json({ ad: req.istifadeci.ad, rol: req.istifadeci.rol, bugun: buGun(), isBaslama: k.isBaslama, isBitme: k.isBitme });
  });

  r.get('/umumi', (req, res) => {
    const { bas, son } = araliq(req.query);
    const say = Object.fromEntries(db.prepare(`SELECT kateqoriya, COUNT(*) AS n FROM hadiseler
      WHERE tarix BETWEEN ? AND ? GROUP BY kateqoriya`).all(bas, son).map((x) => [x.kateqoriya, x.n]));
    const unikal = db.prepare(`SELECT COUNT(DISTINCT emekdas_id) AS n FROM hadiseler
      WHERE tarix BETWEEN ? AND ? AND kateqoriya = 'emekdas'`).get(bas, son).n;
    const qrupla = bas === son ? 'substr(saat, 1, 2)' : 'tarix';
    const seriya = db.prepare(`SELECT ${qrupla} AS acar, kateqoriya, COUNT(*) AS n FROM hadiseler
      WHERE tarix BETWEEN ? AND ? GROUP BY 1, 2 ORDER BY 1`).all(bas, son);
    const aktiv = db.prepare('SELECT COUNT(*) AS n FROM emekdaslar WHERE aktiv = 1').get().n;
    // bu gün: kim gəlib, kim hazırda binadadır, kim gecikib (aralıq bu günü əhatə edirsə)
    const bugun = buGun();
    let buGunX = null;
    if (bas <= bugun && bugun <= son) {
      const gunler = new Map();
      for (const h of db.prepare(`SELECT emekdas_id, saat, istiqamet FROM hadiseler
           WHERE tarix = ? AND kateqoriya = 'emekdas' AND emekdas_id IS NOT NULL`).iterate(bugun)) {
        if (!gunler.has(h.emekdas_id)) gunler.set(h.emekdas_id, []);
        gunler.get(h.emekdas_id).push(h);
      }
      buGunX = { gelen: gunler.size, binada: 0, geciken: 0 };
      for (const hadiseler of gunler.values()) {
        const g = gunSetri(bugun, hadiseler, k, bugun);
        if (g.binadadir) buGunX.binada += 1;
        if (g.gecikmeSan > 0) buGunX.geciken += 1;
      }
    }
    const siqnalSetri = db.prepare("SELECT deyer FROM sistem WHERE acar = 'siqnal'").get();
    const siqnal = siqnalSetri ? JSON.parse(siqnalSetri.deyer) : null;
    if (siqnal) siqnal.onlayn = Date.now() - (siqnal.alindiMs ?? 0) < SIQNAL_ONLAYN_MS;
    res.json({
      bas, son, aktivEmekdas: aktiv, bugun: buGunX, siqnal,
      say: { cemi: Object.values(say).reduce((a, b) => a + b, 0), emekdas: say.emekdas ?? 0, emekdasUnikal: unikal,
        telebe: say.telebe ?? 0, taninmayan: say.taninmayan ?? 0, diger: say.diger ?? 0 },
      seriya: { nov: bas === son ? 'saat' : 'gun', setirler: seriya },
    });
  });

  r.get('/hadiseler', (req, res) => {
    const { bas, son } = araliq(req.query);
    const sert = ['h.tarix BETWEEN ? AND ?'];
    const par = [bas, son];
    const kamera = str(req.query.kamera, 32);
    if (kamera) { sert.push('h.kamera = ?'); par.push(kamera); }
    const kat = str(req.query.kateqoriya, 20);
    if (KATEQORIYA.has(kat)) { sert.push('h.kateqoriya = ?'); par.push(kat); }
    // keçid vaxtına görə (gəliş sırasına görə yox: kamera oflayn qalıb növbəni sonra göndərəndə də sıra düz qalsın);
    // "daha çox" — son göstərilən sətirdən (tarix|saat|no) əvvəlkilər
    const evvel = /^(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2}:\d{2})\|(\d+)$/.exec(str(req.query.evvel, 40));
    if (evvel) { sert.push('(h.tarix, h.saat, h.no) < (?, ?, ?)'); par.push(evvel[1], evvel[2], Number(evvel[3])); }
    const say = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    res.json(db.prepare(`SELECT h.no, h.tarix, h.saat, h.kamera, h.istiqamet, h.kateqoriya, h.emekdas_id, h.oxsarliq,
        e.ad, e.soyad, e.sobe, e.vezife, e.sekil IS NOT NULL AS sekil_var
      FROM hadiseler h LEFT JOIN emekdaslar e ON e.id = h.emekdas_id
      WHERE ${sert.join(' AND ')} ORDER BY h.tarix DESC, h.saat DESC, h.no DESC LIMIT ?`).all(...par, say));
  });

  r.get('/filtrler', (req, res) => {
    const siyahi = (sutun) => db.prepare(`SELECT DISTINCT ${sutun} AS v FROM emekdaslar WHERE aktiv = 1 AND ${sutun} <> ''`)
      .all().map((x) => x.v).sort(AZ.compare);
    res.json({
      sobeler: siyahi('sobe'), vezifeler: siyahi('vezife'),
      kameralar: db.prepare('SELECT DISTINCT kamera AS v FROM hadiseler ORDER BY kamera').all().map((x) => x.v),
    });
  });

  r.get('/emekdaslar', (req, res) => {
    const siyahi = emekdasSec(db, { q: str(req.query.q), sobe: str(req.query.sobe), vezife: str(req.query.vezife) });
    // bu günün vəziyyəti: gəlib, binadadır (bir sorğu ilə)
    const bugun = buGun();
    const gunler = new Map();
    for (const h of db.prepare(`SELECT emekdas_id, saat, istiqamet FROM hadiseler
         WHERE tarix = ? AND kateqoriya = 'emekdas'`).iterate(bugun)) {
      if (!gunler.has(h.emekdas_id)) gunler.set(h.emekdas_id, []);
      gunler.get(h.emekdas_id).push(h);
    }
    res.json(siyahi.map((e) => {
      const hadiseler = gunler.get(e.id);
      if (!hadiseler) return { ...e, bugun: null };
      const g = gunSetri(bugun, hadiseler, k, bugun);
      return { ...e, bugun: { gelis: g.gelis, cixis: g.cixis, binadadir: g.binadadir } };
    }));
  });

  r.get('/emekdaslar/:id', (req, res) => {
    const [e] = emekdasSec(db, { emekdas: req.params.id });
    if (!e) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    const bugun = buGun();
    const hadiseler = db.prepare(`SELECT saat, istiqamet, kamera FROM hadiseler
      WHERE emekdas_id = ? AND tarix = ? ORDER BY saat`).all(e.id, bugun);
    res.json({ ...e, bugun: { ...gunSetri(bugun, hadiseler, k, bugun), hadiseler } });
  });

  r.get('/emekdaslar/:id/sekil', (req, res) => {
    const x = db.prepare('SELECT sekil FROM emekdaslar WHERE id = ?').get(req.params.id);
    if (!x?.sekil) return res.status(404).end();
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' }).send(Buffer.from(x.sekil));
  });

  r.get('/emekdaslar/:id/tarixce', (req, res) => {
    const { bas, son } = araliq(req.query);
    const [e] = emekdasSec(db, { emekdas: req.params.id });
    if (!e) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    const h = hesabatQur(db, k, [e], bas, son);
    res.json({ bas, son, setirler: h.setirler.reverse(), xulase: h.xulase[0] });
  });

  const hesabatFiltri = (q) => ({ q: str(q.q), sobe: str(q.sobe), vezife: str(q.vezife), emekdas: str(q.emekdas, 300) });

  r.get('/hesabat', (req, res) => {
    const { bas, son } = araliq(req.query);
    const f = hesabatFiltri(req.query);
    const h = hesabatQur(db, k, emekdasSec(db, f), bas, son);
    // bütün əməkdaşlar üçün gün-gün cədvəl böyükdür: ekrana yalnız xülasə, seçilmiş əməkdaş üçün günlər də
    res.json({ bas, son, xulase: h.xulase, setirler: f.emekdas ? h.setirler : undefined });
  });

  r.get('/hesabat/excel', asinxron(async (req, res) => {
    const { bas, son } = araliq(req.query);
    const f = hesabatFiltri(req.query);
    const emekdaslar = emekdasSec(db, f);
    const h = hesabatQur(db, k, emekdaslar, bas, son);
    const filtr = [f.q && `axtarış "${f.q}"`, f.sobe && `şöbə: ${f.sobe}`, f.vezife && `vəzifə: ${f.vezife}`,
      f.emekdas && emekdaslar[0] && `əməkdaş: ${emekdaslar[0].ad} ${emekdaslar[0].soyad}`].filter(Boolean).join(', ');
    const buf = await excelYaz(h, { bas, son, filtr, istifadeci: req.istifadeci.ad, k });
    const ad = `davamiyyet_${bas}${bas === son ? '' : `_${son}`}.xlsx`;
    log.info(`excel: ${req.istifadeci.ad} — ${ad} (${emekdaslar.length} əməkdaş${filtr ? `, ${filtr}` : ''})`);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ad}"`,
    }).send(Buffer.from(buf));
  }));

  r.use((err, req, res, next) => {
    if (err instanceof SorguXetasi) return res.status(400).json({ xeta: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ xeta: 'JSON pozuqdur' });
    log.error(err);
    if (res.headersSent) return next(err);
    res.status(500).json({ xeta: 'Serverdə xəta' });
  });
  return r;
}
