// Serveri işə salır: npm start (parametrlər .env-dən; nümunə .env.example).
process.env.TZ ||= 'Asia/Baku';     // "bu gün" və saat kamera sistemi ilə eyni vaxt qurşağında

const { envYukle, konfiqOxu } = await import('./konfiq.js');
envYukle();
const { bazaAc, kohneSekilleriSil } = await import('./db.js');
const { appQur } = await import('./app.js');

const k = konfiqOxu();
const db = bazaAc(k.bazaYolu);
const istifadeci = db.prepare('SELECT COUNT(*) AS n FROM istifadeciler').get().n;
const log = {
  info: (m) => console.log(`${new Date().toISOString()} ${m}`),
  warn: (m) => console.warn(`${new Date().toISOString()} DİQQƏT ${m}`),
  error: (e) => console.error(`${new Date().toISOString()} XƏTA`, e),
};

// tanınmayanların köhnə üz şəkilləri: başlayanda və saatda bir
const temizle = () => {
  const n = kohneSekilleriSil(db, k.sekilGun);
  if (n) log.info(`${n} tanınmayan üz şəkli silindi (${k.sekilGun} gündən köhnə)`);
};
temizle();
setInterval(temizle, 3600_000).unref();

const server = appQur(db, k, log).listen(k.port, k.host, () => {
  log.info(`AzTU HR paneli: http://${k.host}:${k.port} · baza: ${k.bazaYolu}`);
  if (!k.ingestAcar) log.warn('INGEST_ACAR təyin edilməyib — kamera sistemindən məlumat qəbul edilmir');
  if (!k.ingestIp.length) log.warn('INGEST_IP boşdur — kamera API-si istənilən IP-dən açarla qəbul edir');
  if (!istifadeci) log.warn('Heç bir istifadəçi yoxdur: npm run istifadeci -- <ad> [admin|hr]');
});

const dayan = () => {
  log.info('dayanır...');
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', dayan);
process.on('SIGTERM', dayan);
