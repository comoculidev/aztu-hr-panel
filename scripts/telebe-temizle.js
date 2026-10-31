// Əməkdaş siyahısına səhvən düşmüş tələbələri tapır və (--sil ilə) silir. Qayda: src/telebe.js.
//   npm run telebe-temizle            yalnız göstərir, heç nə dəyişmir
//   npm run telebe-temizle -- --sil   adı və şəkli silinir; keçidləri adsız "tələbə" keçidi kimi qalır
// Əvvəlcə kamera kompüterini yeniləyin: yoxsa köhnə versiya tələbələri yenidən göndərər (server artıq qəbul etmir).
import { bazaAc } from '../src/db.js';
import { envYukle, konfiqOxu } from '../src/konfiq.js';
import { telebeleriSil, telebeleriTap } from '../src/telebe.js';

envYukle();
const db = bazaAc(konfiqOxu().bazaYolu);
const sil = process.argv.includes('--sil');

try {
  const siyahi = telebeleriTap(db);
  if (!siyahi.length) {
    console.log('Əməkdaş siyahısında tələbə yoxdur.');
  } else {
    const GOSTER = 40;
    console.log(`Əməkdaş siyahısında tələbəyə oxşayan ${siyahi.length} nəfər (keçidləri: ${siyahi.reduce((c, e) => c + e.hadise, 0)}):`);
    for (const e of siyahi.slice(0, GOSTER)) {
      console.log(`  ${`${e.soyad} ${e.ad}`.padEnd(30)} şöbə: ${e.sobe.padEnd(26)} vəzifə: ${e.vezife.padEnd(24)} keçid: ${e.hadise}`);
    }
    if (siyahi.length > GOSTER) console.log(`  … və daha ${siyahi.length - GOSTER} nəfər`);
    if (sil) {
      const n = telebeleriSil(db, siyahi.map((e) => e.id));
      console.log(`Silindi: ${n.emekdas} nəfər; ${n.hadise} keçid adsız "tələbə" keçidinə çevrildi.`);
    } else {
      console.log('\nHeç nə dəyişmədi. Siyahı düzdürsə: npm run telebe-temizle -- --sil');
    }
  }
} catch (e) {
  console.error(`Xəta: ${e.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
