// Serverin parametrləri .env faylından (git-ə düşmür; nümunə: .env.example).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function envYukle(fayl = path.join(KOK, '.env')) {
  if (existsSync(fayl)) process.loadEnvFile(fayl);
}

const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function konfiqOxu(env = process.env) {
  const k = {
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    bazaYolu: path.resolve(KOK, env.BAZA_YOLU || 'data/hr.db'),
    // kamera sistemi: açar (kamera kompüterindəki HR_API_ACAR ilə eyni) və icazəli IP-lər
    ingestAcar: env.INGEST_ACAR || '',
    ingestIp: (env.INGEST_IP || '').split(',').map((s) => s.trim()).filter(Boolean),
    isBaslama: env.IS_BASLAMA || '09:00',
    // tanınmayanların üz şəkli neçə gün saxlanır (sonra avtomatik silinir)
    sekilGun: Math.max(1, Number(env.SEKIL_SAXLAMA_GUN || 30)),
    isBitme: env.IS_BITME || '18:00',
    sessiyaSaat: Number(env.SESSIYA_SAAT || 8),
    // HTTPS arxasındadırsa (nginx) — true: kuki yalnız şifrəli bağlantıda göndərilir
    tehlukesizKuki: env.TEHLUKESIZ_KUKI === 'true',
    proxyEtibar: env.PROXY_ETIBAR === 'true',
  };
  if (k.ingestAcar && k.ingestAcar.length < 24) {
    throw new Error('INGEST_ACAR ən azı 24 simvol olmalıdır (yaratmaq: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))")');
  }
  for (const [ad, v] of [['IS_BASLAMA', k.isBaslama], ['IS_BITME', k.isBitme]]) {
    if (!SAAT.test(v)) throw new Error(`${ad} SS:DD şəklində olmalıdır: ${v}`);
  }
  if (!Number.isInteger(k.port) || k.port < 1 || k.port > 65535) throw new Error(`PORT düzgün deyil: ${env.PORT}`);
  return k;
}
