// Panel API-si: kadr əlavə, redaktə, silmə; telefondan şəkil linki (QR) və kompüterdən şəkil. Sessiya + X-Aztu tələb
// edir (apiRouter içində qoşulur). Telefonun özü girişsiz /api/v1/sekil-dən istifadə edir (sekilApi.js).
import express from 'express';
import QRCode from 'qrcode';
import { buGun } from './db.js';
import {
  emekdasDeyis, emekdasElave, emekdasSil, jpegdir, linkVeziyyeti, linkYarat, sekilYaz,
} from './emekdasIdare.js';
import { SorguXetasi } from './hesabat.js';
import { qrafikYaz } from './qrafik.js';

const asinxron = (f) => (req, res, next) => Promise.resolve(f(req, res, next)).catch(next);
const ad = (db, id) => {
  const e = db.prepare('SELECT ad, soyad FROM emekdaslar WHERE id = ?').get(id);
  return e ? `${e.ad} ${e.soyad}` : id;
};

export function emekdasRouter(db, k, log = console) {
  const r = express.Router();
  const sekilGovde = express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: '5mb' });

  r.post('/emekdaslar', (req, res) => {
    const sablonId = req.body?.sablon_id;
    if (sablonId !== undefined && sablonId !== null && sablonId !== ''
      && !db.prepare('SELECT 1 FROM qrafik_sablonlari WHERE id = ?').get(Number(sablonId) || 0)) {
      throw new SorguXetasi('İş qrafiki şablonu tapılmadı');
    }
    const id = emekdasElave(db, req.body);
    if (sablonId) qrafikYaz(db, { emekdasId: id, bas: buGun(), sablonId: Number(sablonId), menbe: 'el', kim: req.istifadeci.ad });
    log.info(`kadr: ${req.istifadeci.ad} — əlavə etdi: ${ad(db, id)} (${id})`);
    res.status(201).json({ id });
  });

  r.put('/emekdaslar/:id', (req, res) => {
    if (!emekdasDeyis(db, req.params.id, req.body)) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    log.info(`kadr: ${req.istifadeci.ad} — redaktə etdi: ${ad(db, req.params.id)}`);
    res.json({ ok: true });
  });

  r.delete('/emekdaslar/:id', (req, res) => {
    if (!emekdasSil(db, req.params.id)) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    log.info(`kadr: ${req.istifadeci.ad} — sildi: ${ad(db, req.params.id)}`);
    res.json({ ok: true });
  });

  r.post('/emekdaslar/:id/sekil-link', asinxron(async (req, res) => {
    const l = linkYarat(db, req.params.id, req.istifadeci.ad);
    if (!l) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    // telefon paneli hansı ünvanla açıbsa onu açmalıdır; PANEL_URL ilə dəyişdirilə bilər (nginx, başqa ad)
    const host = req.get('host') || '';
    const url = `${k.panelUrl || `${req.protocol}://${host}`}/sekil/${l.token}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    // localhost ilə açılıbsa telefon bu ünvana çata bilməz — panel xəbərdarlıq göstərir
    const yerli = !k.panelUrl && /^(localhost|127\.|\[::1\])/i.test(host);
    log.info(`kadr: ${req.istifadeci.ad} — şəkil linki yaratdı: ${ad(db, req.params.id)}`);
    res.json({ url, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, bitir: l.bitir, yerli });
  }));

  r.get('/emekdaslar/:id/sekil-link', (req, res) => res.json(linkVeziyyeti(db, req.params.id)));

  r.post('/emekdaslar/:id/sekil', sekilGovde, (req, res) => {
    if (!jpegdir(req.body)) throw new SorguXetasi('Şəkil JPEG olmalıdır');
    if (!sekilYaz(db, req.params.id, req.body)) return res.status(404).json({ xeta: 'Əməkdaş tapılmadı' });
    log.info(`kadr: ${req.istifadeci.ad} — şəkil yüklədi: ${ad(db, req.params.id)}`);
    res.json({ ok: true });
  });

  return r;
}
