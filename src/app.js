// Express tətbiqi: kamera API-si (/api/v1/ingest), panel API-si (/api), səhifələr (public/).
import path from 'node:path';
import express from 'express';
import { kukiOxu, sessiyaTap } from './auth.js';
import { KUKI, apiRouter } from './api.js';
import { ingestRouter } from './ingest.js';
import { KOK } from './konfiq.js';

const PUBLIC = path.join(KOK, 'public');

export function appQur(db, k, log = console) {
  const app = express();
  app.disable('x-powered-by');
  if (k.proxyEtibar) app.set('trust proxy', 'loopback');   // nginx arxasında: req.ip — həqiqi müştəri

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
        + "frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  app.use('/api/v1/ingest', ingestRouter(db, k, log));
  app.use('/api', apiRouter(db, k, log));

  const girib = (req) => Boolean(sessiyaTap(db, kukiOxu(req, KUKI)));
  app.get('/', (req, res) => {
    if (!girib(req)) return res.redirect(302, '/giris');
    res.set('Cache-Control', 'no-store').sendFile(path.join(PUBLIC, 'index.html'));
  });
  app.get('/giris', (req, res) => {
    if (girib(req)) return res.redirect(302, '/');
    res.set('Cache-Control', 'no-store').sendFile(path.join(PUBLIC, 'giris.html'));
  });
  // yalnız JS, CSS, ikonlar (məlumat yoxdur); index.html birbaşa verilmir
  app.use('/static', express.static(path.join(PUBLIC, 'static'), { index: false, maxAge: '1h' }));
  app.use((req, res) => res.status(404).type('text/plain').send('Tapılmadı'));
  return app;
}
