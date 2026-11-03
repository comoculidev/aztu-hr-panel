// İş qrafiki və kadr siyahısı API-si (panel üçün; apiRouter-in sessiya qatından sonra qoşulur — girişsiz əlçatan deyil).
import express from 'express';
import ExcelJS from 'exceljs';
import { buGun, emeliyyat } from './db.js';
import { SorguXetasi, araliq, emekdasSec } from './hesabat.js';
import { kadrTetbiqEt, kadrYukle } from './kadr.js';
import { qrafikTap, qrafikXeritesi, qrafikYaz, sablonSaatYaz, sablonSaati } from './qrafik.js';

const asinxron = (f) => (req, res, next) => Promise.resolve(f(req, res, next)).catch(next);
const str = (v, maks = 200) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');
const basOxu = (v) => araliq({ bas: str(v, 10) || buGun() }).bas;

/** Brauzerdən qayıdan kadr sətri — yalnız tanınan sahələr, mətnlər qısaldılır */
const kadrSetri = (s) => ({
  ad: str(s?.ad, 100), soyad: str(s?.soyad, 100), ata: str(s?.ata, 100), muessise: str(s?.muessise), vezife: str(s?.vezife),
  isci_qrup: str(s?.isci_qrup), tip: str(s?.tip, 60), stat: Number.isFinite(s?.stat) ? s.stat : null,
  is_vaxti: str(s?.is_vaxti, 40), cixis: null,
});

export function qrafikRouter(db, k, log = console) {
  const r = express.Router();
  const sablon = (id) => db.prepare('SELECT id, acar, ad FROM qrafik_sablonlari WHERE id = ?').get(Number(id) || 0);
  const emekdas = (id) => db.prepare('SELECT id, ad, soyad, aktiv FROM emekdaslar WHERE id = ?').get(String(id));

  r.get('/qrafik/sablonlar', (req, res) => {
    const bugun = buGun();
    const aktivler = emekdasSec(db).map((e) => e.id);
    const q = qrafikXeritesi(db, k, aktivler, bugun, bugun);
    const say = new Map();
    for (const id of aktivler) {
      const s = q(id, bugun).sablonId;
      if (s) say.set(s, (say.get(s) ?? 0) + 1);
    }
    const saatlar = db.prepare('SELECT bas, baslama, bitme, kim, yaradilib FROM sablon_saatlari WHERE sablon_id = ? ORDER BY bas DESC');
    res.json(db.prepare('SELECT id, acar, ad FROM qrafik_sablonlari ORDER BY sira').all().map((s) => ({
      ...s, ...sablonSaati(db, s.id, bugun), saatlar: saatlar.all(s.id), emekdasSayi: say.get(s.id) ?? 0,
    })));
  });

  r.post('/qrafik/sablonlar/:id/saat', (req, res) => {
    const s = sablon(req.params.id);
    if (!s) return res.status(404).json({ xeta: 'Şablon tapılmadı' });
    const bas = basOxu(req.body?.bas);
    const [baslama, bitme] = [str(req.body?.baslama, 5), str(req.body?.bitme, 5)];
    sablonSaatYaz(db, { sablonId: s.id, bas, baslama, bitme, kim: req.istifadeci.ad });
    log.info(`qrafik: ${req.istifadeci.ad} — şablon "${s.ad}" ${bas}-dən ${baslama}–${bitme}`);
    res.json({ ok: true });
  });

  r.get('/emekdaslar/:id/qrafik', (req, res) => {
    const e = emekdas(req.params.id);
    if (!e) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    const bugun = buGun();
    const q = qrafikTap(db, k, e.id, bugun);
    const aktivSetir = db.prepare('SELECT bas FROM emekdas_qrafik WHERE emekdas_id = ? AND bas <= ? ORDER BY bas DESC LIMIT 1')
      .get(e.id, bugun);
    const tarixce = db.prepare(`SELECT g.bas, g.sablon_id, s.ad AS sablon, g.baslama, g.bitme, g.menbe, g.kim, g.yaradilib
      FROM emekdas_qrafik g LEFT JOIN qrafik_sablonlari s ON s.id = g.sablon_id
      WHERE g.emekdas_id = ? ORDER BY g.bas DESC`).all(e.id).map((x) => ({
      ...x, ad: x.sablon ?? 'Fərdi', ...(x.sablon_id ? sablonSaati(db, x.sablon_id, x.bas) : {}),
    }));
    res.json({
      indiki: { ad: q.ad, baslama: q.isBaslama, bitme: q.isBitme, menbe: q.menbe, sablonId: q.sablonId, bas: aktivSetir?.bas ?? null },
      tarixce,
      kadr: db.prepare(`SELECT sira, muessise, vezife, isci_qrup, tip, stat, is_vaxti, yuklenib FROM kadr_melumati
        WHERE emekdas_id = ? ORDER BY sira`).all(e.id),
    });
  });

  r.post('/emekdaslar/:id/qrafik', (req, res) => {
    const e = emekdas(req.params.id);
    if (!e) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    const b = req.body ?? {};
    const bas = basOxu(b.bas);
    const kim = req.istifadeci.ad;
    if (b.sablon_id !== undefined && b.sablon_id !== null && b.sablon_id !== '') {
      const s = sablon(b.sablon_id);
      if (!s) throw new SorguXetasi('Şablon tapılmadı');
      qrafikYaz(db, { emekdasId: e.id, bas, sablonId: s.id, menbe: 'el', kim });
      log.info(`qrafik: ${kim} — ${e.ad} ${e.soyad}: ${bas}-dən "${s.ad}"`);
    } else {
      if (!b.baslama && !b.bitme) throw new SorguXetasi('Şablon və ya başlama/bitmə saatı seçin');
      const [baslama, bitme] = [str(b.baslama, 5), str(b.bitme, 5)];
      qrafikYaz(db, { emekdasId: e.id, bas, baslama, bitme, menbe: 'el', kim });
      log.info(`qrafik: ${kim} — ${e.ad} ${e.soyad}: ${bas}-dən fərdi ${baslama}–${bitme}`);
    }
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- kadr siyahısı (Excel)
  r.post('/kadr/yukle', express.raw({ type: () => true, limit: '5mb' }), asinxron(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new SorguXetasi('Fayl boşdur');
    const bas = basOxu(req.query.bas);
    const n = await kadrYukle(db, req.body, { bas, kim: req.istifadeci.ad });
    log.info(`kadr: ${req.istifadeci.ad} — ${n.cemi} nəfər, ${n.tapildi} tapıldı (${n.yazildi} yazıldı, ${n.qorundu} əl ilə`
      + ` qorundu), ${n.ehtimal.length} ehtimal, ${n.coxmenali.length} çoxmənalı, ${n.yoxdur.length} sistemdə yoxdur`);
    res.json(n);
  }));

  r.post('/kadr/tesdiq', (req, res) => {
    const b = req.body ?? {};
    const e = emekdas(b.emekdas_id);
    if (!e?.aktiv) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    if (!Array.isArray(b.setirler) || !b.setirler.length || b.setirler.length > 20) throw new SorguXetasi('setirler: 1-20 sətir');
    const bas = basOxu(b.bas);
    const netice = emeliyyat(db, () => kadrTetbiqEt(db, { emekdasId: e.id, setirler: b.setirler.map(kadrSetri), bas,
      kim: req.istifadeci.ad }));
    log.info(`kadr: ${req.istifadeci.ad} — təsdiq: ${e.ad} ${e.soyad} (${netice})`);
    res.json({ netice });
  });

  r.post('/kadr/excel', asinxron(async (req, res) => {
    const sexsler = req.body?.setirler;
    if (!Array.isArray(sexsler) || sexsler.length > 5000) throw new SorguXetasi('setirler: ən çox 5000');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sistemdə yoxdur');
    ws.columns = [['Adı', 14], ['Soyadı', 18], ['Atasının adı', 14], ['Müəssisənin adı', 40], ['Vəzifəsi', 36],
      ['İşçi qrup', 26], ['İşçilərin tipi', 22], ['Ştat vahidi', 10], ['İş vaxtı', 12]].map(([header, width]) => ({ header, width }));
    for (const x of sexsler) {
      for (const s of (Array.isArray(x?.setirler) ? x.setirler : [x]).slice(0, 20).map(kadrSetri)) {
        ws.addRow([s.ad, s.soyad, s.ata, s.muessise, s.vezife, s.isci_qrup, s.tip, s.stat, s.is_vaxti]);
      }
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sistemde_olmayan_${buGun()}.xlsx"`,
    }).send(Buffer.from(await wb.xlsx.writeBuffer()));
  }));

  return r;
}
