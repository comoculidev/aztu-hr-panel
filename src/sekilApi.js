// Telefondan kadr şəkli: girişsiz, yalnız tokenlə (24 saat, bir dəfəlik). Token URL-dədir, bazada heşi saxlanır.
// Cavabda kadrın yalnız adı və soyadı olur. POST yalnız "Content-Type: image/jpeg" ilə — sadə HTML forması bu tipi
// göndərə bilmədiyi üçün başqa saytdan saxta göndəriş də keçmir.
import express from 'express';
import { jpegdir, linkTap, linkleSekilYaz } from './emekdasIdare.js';

const BAGLI = 'Link vaxtı keçib və ya istifadə olunub. HR-dən yeni link istəyin.';

export function sekilRouter(db, log = console) {
  const r = express.Router();

  r.get('/:token', (req, res) => {
    const l = linkTap(db, req.params.token);
    if (l.veziyyet === 'yox') return res.status(404).json({ xeta: 'Link tapılmadı' });
    if (l.veziyyet === 'bagli') return res.status(410).json({ xeta: BAGLI });
    res.set('Cache-Control', 'no-store').json({ ad: l.emekdas.ad, soyad: l.emekdas.soyad });
  });

  r.post('/:token', express.raw({ type: 'image/jpeg', limit: '5mb' }), (req, res) => {
    if (!req.is('image/jpeg')) return res.status(415).json({ xeta: 'Şəkil JPEG olmalıdır' });
    const l = linkTap(db, req.params.token);
    if (l.veziyyet === 'yox') return res.status(404).json({ xeta: 'Link tapılmadı' });
    if (!jpegdir(req.body)) return res.status(400).json({ xeta: 'Şəkil JPEG olmalıdır' });
    const n = linkleSekilYaz(db, req.params.token, req.body);
    if (n === 'yox') return res.status(404).json({ xeta: 'Link tapılmadı' });
    if (n === 'bagli') return res.status(410).json({ xeta: BAGLI });
    log.info(`kadr: telefondan şəkil alındı — ${l.emekdas?.ad ?? ''} ${l.emekdas?.soyad ?? ''}`.trim());
    res.json({ ok: true });
  });

  r.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ xeta: 'Şəkil çox böyükdür (ən çox 5 MB)' });
    log.error(`sekil: ${err?.message ?? err}`);
    res.status(500).json({ xeta: 'Server xətası' });
  });
  return r;
}
