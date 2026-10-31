// Panel istifadəçiləri (qeydiyyat səhifəsi yoxdur — istifadəçini server administratoru yaradır):
//   npm run istifadeci -- <ad> [admin|hr]     yarat və ya parolu dəyiş (parol gizli soruşulur)
//   npm run istifadeci -- --siyahi            siyahı
//   npm run istifadeci -- --sondur <ad>       girişi bağla (sessiyaları da)
// Avtomatlaşdırma üçün parol stdin-dən: echo "parol" | npm run istifadeci -- <ad> hr --stdin
import { createInterface } from 'node:readline';
import { istifadeciYaz } from '../src/auth.js';
import { bazaAc } from '../src/db.js';
import { envYukle, konfiqOxu } from '../src/konfiq.js';

envYukle();
const db = bazaAc(konfiqOxu().bazaYolu);
const arq = process.argv.slice(2);

function gizliSorus(sual) {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(sual)) process.stdout.write(s); };   // yazılan parol görünməsin
    rl.question(sual, (cavab) => { rl.close(); process.stdout.write('\n'); ok(cavab); });
  });
}

async function stdinOxu() {
  let m = '';
  for await (const p of process.stdin) m += p;
  return m.split(/\r?\n/)[0];
}

try {
  if (arq[0] === '--siyahi') {
    for (const i of db.prepare('SELECT ad, rol, aktiv, son_giris FROM istifadeciler ORDER BY ad').all()) {
      console.log(`${i.ad.padEnd(20)} ${i.rol.padEnd(6)} ${i.aktiv ? 'aktiv ' : 'bağlı '} son giriş: ${i.son_giris ?? '—'}`);
    }
  } else if (arq[0] === '--sondur' && arq[1]) {
    const n = db.prepare('UPDATE istifadeciler SET aktiv = 0 WHERE ad = ?').run(arq[1]).changes;
    db.prepare('DELETE FROM sessiyalar WHERE istifadeci_id IN (SELECT id FROM istifadeciler WHERE ad = ?)').run(arq[1]);
    console.log(n ? `${arq[1]}: giriş bağlandı` : `${arq[1]} tapılmadı`);
  } else if (arq[0] && !arq[0].startsWith('--')) {
    const [ad, rol = 'hr'] = arq;
    let parol;
    if (arq.includes('--stdin')) {
      parol = await stdinOxu();
    } else {
      parol = await gizliSorus(`${ad} üçün parol (ən azı 10 simvol): `);
      if (parol !== await gizliSorus('Parolu təkrar yazın: ')) throw new Error('Parollar eyni deyil');
    }
    istifadeciYaz(db, ad, parol, rol === '--stdin' ? 'hr' : rol);
    console.log(`${ad} (${rol === '--stdin' ? 'hr' : rol}) hazırdır.`);
  } else {
    console.log('İstifadə: npm run istifadeci -- <ad> [admin|hr] | --siyahi | --sondur <ad>');
  }
} catch (e) {
  console.error(`Xəta: ${e.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
