// Excel çıxarışı: ekranda nə seçilibsə (müddət, şöbə, vəzifə, axtarış, əməkdaş) — o. Müddətlər Excel vaxt dəyəri kimi
// yazılır ([h]:mm formatı): HR onları Excel-də toplaya, süzə bilir.
import ExcelJS from 'exceljs';
import { bosluqYaz, muddetSoz } from './davamiyyet.js';
import { HEFTE } from './hesabat.js';

const VAXT = '[h]:mm';
const gun = (san) => (san === null || san === undefined ? null : san / 86400);
const VEZIYYET = { geldi: 'Gəlib', gelmeyib: 'Gəlməyib', istirahet: 'İstirahət günü' };

function basliqStil(ws) {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  r.alignment = { vertical: 'middle', wrapText: true };
  r.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
}

export async function excelYaz({ setirler, xulase }, { bas, son, filtr, istifadeci, k }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AzTU HR paneli';
  wb.created = new Date();

  const x = wb.addWorksheet('Xülasə');
  x.columns = [
    { header: 'Soyad', key: 'soyad', width: 18 }, { header: 'Ad', key: 'ad', width: 14 },
    { header: 'Ata adı', key: 'ata', width: 14 }, { header: 'Şöbə', key: 'sobe', width: 28 },
    { header: 'Vəzifə', key: 'vezife', width: 20 }, { header: 'Gəldiyi gün', key: 'gelenGun', width: 10 },
    { header: 'Gəlmədiyi iş günü', key: 'gelmeyenGun', width: 11 },
    { header: 'Cəmi işdə', key: 'isde', width: 11, style: { numFmt: VAXT } },
    { header: 'Cəmi işdə olmama', key: 'olmama', width: 12, style: { numFmt: VAXT } },
    { header: 'Cəmi kənarda (sözlə)', key: 'olmamaSoz', width: 15 },
    { header: 'Gecikmə sayı', key: 'gecikmeSayi', width: 10 },
    { header: 'Cəmi gecikmə', key: 'gecikme', width: 11, style: { numFmt: VAXT } },
    { header: 'Orta gəliş', key: 'ortaGelis', width: 10 },
    { header: 'Natamam gün (giriş/çıxış görünməyib)', key: 'natamamGun', width: 16 },
  ];
  for (const e of xulase) {
    x.addRow({ ...e, isde: gun(e.isdeSan), olmama: gun(e.olmamaSan), olmamaSoz: muddetSoz(e.olmamaSan), gecikme: gun(e.gecikmeSan), ortaGelis: e.ortaGelis ?? '—' });
  }
  basliqStil(x);

  const g = wb.addWorksheet('Gündəlik');
  g.columns = [
    { header: 'Tarix', key: 'tarix', width: 11 }, { header: 'Həftə günü', key: 'hefte', width: 15 },
    { header: 'Soyad', key: 'soyad', width: 18 }, { header: 'Ad', key: 'ad', width: 14 },
    { header: 'Ata adı', key: 'ata', width: 14 }, { header: 'Şöbə', key: 'sobe', width: 28 },
    { header: 'Vəzifə', key: 'vezife', width: 20 }, { header: 'Vəziyyət', key: 'veziyyet', width: 12 },
    { header: 'Gəliş', key: 'gelis', width: 9 }, { header: 'Çıxış', key: 'cixis', width: 9 },
    { header: 'İşdə olma', key: 'isde', width: 10, style: { numFmt: VAXT } },
    { header: 'İşdə olmama', key: 'olmama', width: 11, style: { numFmt: VAXT } },
    { header: 'Kənarda (cəmi)', key: 'olmamaSoz', width: 14 },
    { header: 'Kənarda olduğu vaxtlar', key: 'bosluqlar', width: 34 },
    { header: 'Gecikmə', key: 'gecikme', width: 9, style: { numFmt: VAXT } },
    { header: 'Erkən çıxış', key: 'erken', width: 10, style: { numFmt: VAXT } },
    { header: 'Keçid sayı', key: 'kecidSayi', width: 8 }, { header: 'Qeyd', key: 'qeyd', width: 40 },
  ];
  for (const s of setirler) {
    const geldi = s.veziyyet === 'geldi';
    const r = g.addRow({
      ...s, veziyyet: VEZIYYET[s.veziyyet] ?? s.veziyyet, gelis: s.gelis ?? '', cixis: s.cixis ?? '',
      isde: geldi ? gun(s.isdeSan) : null, olmama: geldi ? gun(s.olmamaSan) : null,
      olmamaSoz: geldi ? muddetSoz(s.olmamaSan) : '', bosluqlar: (s.bosluqlar ?? []).map(bosluqYaz).join('; '),
      gecikme: geldi && s.gecikmeSan ? gun(s.gecikmeSan) : null, erken: geldi && s.erkenCixisSan ? gun(s.erkenCixisSan) : null,
      qeyd: [s.binadadir ? 'hazırda binadadır' : '', ...s.qeydler].filter(Boolean).join('; '),
    });
    if (s.veziyyet === 'gelmeyib') r.font = { color: { argb: 'FFC00000' } };
  }
  basliqStil(g);

  const p = wb.addWorksheet('Parametrlər');
  p.columns = [{ header: 'Parametr', key: 'a', width: 28 }, { header: 'Dəyər', key: 'b', width: 70 }];
  p.addRows([
    { a: 'Müddət', b: bas === son ? bas : `${bas} — ${son}` },
    { a: 'Süzgəc', b: filtr || 'hamısı' },
    { a: 'Əməkdaş sayı', b: xulase.length },
    { a: 'İş qrafiki', b: `${k.isBaslama} — ${k.isBitme}, bazar ertəsi — cümə` },
    { a: 'Qayda', b: 'Gəliş = günün ilk girişi; çıxış = günün son çıxışı; gün içində çıxıb-qayıtma = işdə olmama.' },
    { a: 'Həftə günləri', b: HEFTE.join(', ') },
    { a: 'Hazırladı', b: `${istifadeci}, ${new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}` },
  ]);
  basliqStil(p);
  return wb.xlsx.writeBuffer();
}
