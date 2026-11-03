// Kadr Excel-i: oxuma (başlığa görə), ad uyğunlaşdırması, Əsas sətir, şablon seçimi, təkrar yükləmə. Adlar uydurmadır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { bazaAc, indiYaz } from '../src/db.js';
import { SorguXetasi } from '../src/hesabat.js';
import { eslemeYaz, esasSetir, kadrOxu, kadrYukle, qatla, sablonAcari } from '../src/kadr.js';
import { qrafikTap, qrafikYaz } from '../src/qrafik.js';

const K = { isBaslama: '09:00', isBitme: '18:00' };
const BASLIQ = ['Pin kod', 'Adı', 'Soyadı', 'Atasının adı', 'Müəssisənin adı', 'Vəzifəsi', 'İşçi qrup', 'İşçilərin tipi',
  'Ştat vahidi', 'İşdən çıxma sən. tarixi', 'İş vaxtı'];

async function excelQur(basliqlar, setirler) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Person');
  ws.addRow(basliqlar);
  for (const s of setirler) ws.addRow(s);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
// [ad, soyad, ata, tip, ştat, iş vaxtı, çıxış tarixi] → BASLIQ sırası ilə sətir
const setir = (ad, soyad, ata = '', tip = 'Əsas', stat = '1', vaxt = 'Tam', cixis = null) =>
  ['ZZZ9999', ad, soyad, ata, 'Kafedra', 'Dosent', 'Professor müəllim heyəti', tip, stat, cixis, vaxt];

function baza(adamlar) {
  const db = bazaAc(':memory:');
  const yaz = db.prepare(`INSERT INTO emekdaslar (id, ad, soyad, ata, sobe, vezife, aktiv, axtaris, yaradilib, yenilenib)
    VALUES (?, ?, ?, '', 'Kafedra', ?, ?, '', ?, ?)`);
  for (const [id, ad, soyad, vezife = 'DOSENT', aktiv = 1] of adamlar) yaz.run(id, ad, soyad, vezife, aktiv, indiYaz(), indiYaz());
  return db;
}
const acar = (db, id, t = '2026-11-03') => {
  const q = qrafikTap(db, K, id, t);
  return q.sablonId ? db.prepare('SELECT acar FROM qrafik_sablonlari WHERE id = ?').get(q.sablonId).acar : q.ad;
};

test('qatla: ə=e=a, ş=sh, c=j', () => {
  assert.equal(qatla('Həsənov'), qatla('Hesenov'));
  assert.equal(qatla('Həsənov'), qatla('Hasanov'));
  assert.equal(qatla('Cəlilov'), qatla('Jalilov'));
  assert.equal(qatla('Haşımlı'), qatla('Hashimli'));
  assert.equal(qatla('İsmayılzadə'), qatla('Ismayilzade'));
  assert.notEqual(qatla('Əli'), qatla('Elşən'));
});

test('sütunlar başlıq adına görə, sıra və boşluq fərq etmir; FİN oxunmur', async () => {
  const buf = await excelQur([' İş vaxtı ', 'Pin kod', 'adı', 'Soyadı', 'Ştat  vahidi', 'İşçilərin tipi', 'Təvəllüdü'],
    [['Tam', 'ZZZ9999', 'Əli', 'Vəliyev', '0.50', 'Əsas', '01.01.1980']]);
  const { setirler } = await kadrOxu(buf);
  assert.equal(setirler.length, 1);
  assert.deepEqual([setirler[0].ad, setirler[0].soyad, setirler[0].stat, setirler[0].is_vaxti, setirler[0].tip],
    ['Əli', 'Vəliyev', 0.5, 'Tam', 'Əsas']);
  const json = JSON.stringify(setirler);
  assert.ok(!json.includes('ZZZ9999') && !json.includes('1980'));
});

test('məcburi sütun yoxdursa aydın xəta; Excel olmayan fayl', async () => {
  const buf = await excelQur(['Adı', 'Soyadı', 'İşçilərin tipi', 'İş vaxtı'], [['Əli', 'Vəliyev', 'Əsas', 'Tam']]);
  await assert.rejects(kadrOxu(buf), (e) => e instanceof SorguXetasi && e.message.includes('Ştat vahidi'));
  await assert.rejects(kadrOxu(Buffer.from('bu excel deyil')), (e) => e instanceof SorguXetasi && /oxunmadı/.test(e.message));
});

test('Əsas sətir və şablon', () => {
  const s = (tip, stat, is_vaxti = 'Tam') => ({ tip, stat, is_vaxti });
  assert.equal(esasSetir([s('Daxili əvəzçi', 0.5), s('Əsas', 1)]).tip, 'Əsas');
  assert.equal(esasSetir([s('Müqavilə üzrə əvəzçi', 0.25), s('Müqavilə üzrə əvəzçi', 0.5)]).stat, 0.5);
  assert.equal(sablonAcari(s('Əsas', 1)).acar, 'tam_1');
  assert.equal(sablonAcari(s('Əsas', 0.75)).acar, 'stat_075');
  assert.equal(sablonAcari(s('Əsas', 0.5)).acar, 'stat_05');
  assert.equal(sablonAcari(s('Əsas', 0.25)).acar, 'stat_025');
  assert.equal(sablonAcari(s('Əsas', 1, 'Qisaldılmış')).acar, 'qisaldilmis');
  assert.equal(sablonAcari(s('Əsas', 1, 'Natamam')).acar, 'natamam');
  const x = sablonAcari(s('Əsas', 0.4));
  assert.equal(x.acar, 'tam_1');
  assert.ok(x.xeberdarliq);
});

test('ştat mətn, vergüllü və rəqəm kimi — hamısı 0,5', async () => {
  const buf = await excelQur(BASLIQ, [setir('A', 'B', '', 'Əsas', '0.50'), setir('C', 'D', '', 'Əsas', '0,5'), setir('E', 'F', '', 'Əsas', 0.5)]);
  const { setirler } = await kadrOxu(buf);
  assert.deepEqual(setirler.map((x) => sablonAcari(x).acar), ['stat_05', 'stat_05', 'stat_05']);
});

test('uyğunlaşdırma: tapıldı / ehtimal / çoxmənalı / yoxdur', async () => {
  const db = baza([['ali', 'Ali', 'Veliyev'], ['leyla', 'Leyla', 'Hesenova'], ['r1', 'Resad', 'Celilov', 'DOSENT'],
    ['r2', 'Resad', 'Celilov', 'BAS-MUELLIM'], ['kamran', 'Kamran', 'Quliyev', 'DOSENT', 0]]);
  const buf = await excelQur(BASLIQ, [setir('Əli', 'Vəliyev', 'Rasim'), setir('Leyla', 'Hüsənova'), setir('Rəşad', 'Cəlilov'),
    setir('Kamran', 'Quliyev'), setir('Nigar', 'Abbasova')]);
  const n = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.equal(n.cemi, 5);
  assert.equal(n.tapildi, 3);
  assert.equal(acar(db, 'ali'), 'tam_1');
  assert.deepEqual([acar(db, 'r1'), acar(db, 'r2')], ['tam_1', 'tam_1']);   // Excel-də bir Rəşad Cəlilov — hər iki qeyd onun
  assert.deepEqual(n.ehtimal.map((x) => [x.sexs.soyad, x.sebeb, x.namizedler.map((c) => c.id)]), [['Hüsənova', 'yazilis', ['leyla']]]);
  assert.deepEqual(n.coxmenali, []);
  assert.deepEqual(n.excelsiz.map((e) => e.id), []);
  assert.deepEqual(n.yoxdur.map((x) => x.soyad).sort(), ['Abbasova', 'Quliyev']);
  assert.equal(acar(db, 'leyla'), 'Standart');                // ehtimal avtomatik təyin olunmur
  assert.ok(!JSON.stringify(n).includes('ZZZ9999'));
});

test('iki Excel şəxsi bir əməkdaşa düşürsə — çoxmənalı', async () => {
  const db = baza([['ali', 'Ali', 'Veliyev']]);
  const buf = await excelQur(BASLIQ, [setir('Əli', 'Vəliyev', 'Rasim'), setir('Əli', 'Vəliyev', 'Kamil')]);
  const n = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.equal(n.tapildi, 0);
  assert.equal(n.coxmenali.length, 2);
  assert.equal(acar(db, 'ali'), 'Standart');
});

test('işdən çıxma tarixi keçibsə atılır', async () => {
  const db = baza([['ali', 'Ali', 'Veliyev']]);
  const buf = await excelQur(BASLIQ, [setir('Əli', 'Vəliyev', '', 'Əsas', '1', 'Tam', '01.10.2026')]);
  const n = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.equal(n.isdenCixib, 1);
  assert.deepEqual([n.tapildi, n.ehtimal.length, n.coxmenali.length, n.yoxdur.length], [0, 0, 0, 0]);
});

test('yenidən yükləmə: əl ilə dəyişən qorunur, Excel mənbəli yenilənir, eyni şablon yazılmır', async () => {
  const db = baza([['ali', 'Ali', 'Veliyev'], ['leyla', 'Leyla', 'Hesenova']]);
  const bir = await excelQur(BASLIQ, [setir('Əli', 'Vəliyev'), setir('Leyla', 'Həsənova')]);
  assert.equal((await kadrYukle(db, bir, { bas: '2026-10-01', kim: 't' })).yazildi, 2);
  qrafikYaz(db, { emekdasId: 'ali', bas: '2026-10-15', baslama: '10:00', bitme: '15:00', menbe: 'el', kim: 't' });
  const iki = await excelQur(BASLIQ, [setir('Əli', 'Vəliyev', '', 'Əsas', '0.5'), setir('Leyla', 'Həsənova', '', 'Əsas', '0.5')]);
  const n2 = await kadrYukle(db, iki, { bas: '2026-11-01', kim: 't' });
  assert.deepEqual([n2.qorundu, n2.yazildi], [1, 1]);
  assert.equal(acar(db, 'ali'), 'Fərdi');
  assert.equal(acar(db, 'leyla'), 'stat_05');
  assert.equal(acar(db, 'leyla', '2026-10-20'), 'tam_1');        // köhnə gün köhnə şablonla
  const n3 = await kadrYukle(db, iki, { bas: '2026-11-03', kim: 't' });
  assert.deepEqual([n3.deyismedi, n3.qorundu, n3.yazildi], [1, 1, 0]);
});

test('kadr_melumati: Əsas sətir sira 0, əvəzçilik sira 1', async () => {
  const db = baza([['ali', 'Ali', 'Veliyev']]);
  const buf = await excelQur(BASLIQ, [setir('Əli', 'Vəliyev', 'Rasim', 'Daxili əvəzçi', '0.50'), setir('Əli', 'Vəliyev', 'Rasim', 'Əsas', '1')]);
  await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  const k = db.prepare('SELECT sira, tip, stat FROM kadr_melumati WHERE emekdas_id = ? ORDER BY sira').all('ali').map((x) => ({ ...x }));
  assert.deepEqual(k, [{ sira: 0, tip: 'Əsas', stat: 1 }, { sira: 1, tip: 'Daxili əvəzçi', stat: 0.5 }]);
  assert.equal(acar(db, 'ali'), 'tam_1');
});

test('yenidən yükləmə daha erkən tarixlə: sonrakı Excel qrafiki silinir, yeni şablon bu gün də qüvvədədir', async () => {
  const db = baza([['ali', 'Ali', 'Veliyev']]);
  await kadrYukle(db, await excelQur(BASLIQ, [setir('Əli', 'Vəliyev')]), { bas: '2026-11-03', kim: 't' });
  qrafikYaz(db, { emekdasId: 'ali', bas: '2026-12-01', baslama: '10:00', bitme: '15:00', menbe: 'el', kim: 't' });
  const n = await kadrYukle(db, await excelQur(BASLIQ, [setir('Əli', 'Vəliyev', '', 'Əsas', '0,5')]), { bas: '2026-11-01', kim: 't' });
  assert.equal(n.yazildi, 1);
  assert.equal(acar(db, 'ali', '2026-11-03'), 'stat_05');
  assert.equal(acar(db, 'ali', '2026-12-05'), 'Fərdi');          // əl ilə qoyulan sonrakı qrafik qalır
});

test('başlıqlar böyük hərflə və latın "I" ilə yazılsa da tanınır', async () => {
  const buf = await excelQur(['ADI', 'SOYADI', 'IŞÇILƏRIN TIPI', 'ŞTAT VAHİDİ', 'IŞ VAXTI', 'Işdən çıxma sən. tarixi', 'Işçi qrup'],
    [['Əli', 'Vəliyev', 'Əsas', '1', 'Tam', '01.10.2026', 'Professor müəllim heyəti']]);
  const { setirler } = await kadrOxu(buf);
  assert.deepEqual([setirler[0].tip, setirler[0].is_vaxti, setirler[0].cixis, setirler[0].isci_qrup],
    ['Əsas', 'Tam', '2026-10-01', 'Professor müəllim heyəti']);
});

// [ad, soyad, ata, müəssisə, vəzifə, tip, ştat] → BASLIQ sırası ilə sətir
const tamSetir = (ad, soyad, ata, muessise, vezife, tip = 'Əsas', stat = '1') =>
  ['ZZZ9999', ad, soyad, ata, muessise, vezife, 'Professor müəllim heyəti', tip, stat, null, 'Tam'];

test('kamera bazasında eyni adamın bir neçə qeydi — qrafik hamısına yazılır', async () => {
  const db = baza([['a1', 'Ali', 'Veliyev', 'MUTEXESIS'], ['a2', 'Ali', 'Veliyev', 'MUTEXESSIS'], ['a3', 'Ali', 'Veliyev', 'DOSENT']]);
  const buf = await excelQur(BASLIQ, [tamSetir('Əli', 'Vəliyev', 'Rasim', 'Kitabxana', 'Mütəxəssis', 'Əsas', '0.5'),
    tamSetir('Əli', 'Vəliyev', 'Rasim', 'Fizika kafedrası', 'Dosent', 'Daxili əvəzçi', '0.25')]);
  const n = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.equal(n.tapildi, 3);
  assert.deepEqual(['a1', 'a2', 'a3'].map((id) => acar(db, id)), ['stat_05', 'stat_05', 'stat_05']);
  assert.deepEqual([n.coxmenali.length, n.excelsiz.length], [0, 0]);
});

test('bir Excel şəxsi, vəzifə heç bir qeydə uyğun deyil — hamısına yazılır', async () => {
  const db = baza([['a1', 'Ali', 'Veliyev', 'MUELLIM'], ['a2', 'Ali', 'Veliyev', 'MUELLIM']]);
  const buf = await excelQur(BASLIQ, [tamSetir('Əli', 'Vəliyev', '', 'Fizika kafedrası', 'Dosent')]);
  const n = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.equal(n.tapildi, 2);
});

test('Excel-də eyni adlı iki adam — vəzifəyə görə ayrılır', async () => {
  const db = baza([['d', 'Ali', 'Veliyev', 'DOSENT'], ['m', 'Ali', 'Veliyev', 'BAS-MUELLIM']]);
  const buf = await excelQur(BASLIQ, [tamSetir('Əli', 'Vəliyev', 'Rasim', 'Fizika kafedrası', 'Dosent', 'Əsas', '0.5'),
    tamSetir('Əli', 'Vəliyev', 'Kamil', 'Kimya kafedrası', 'Baş müəllim', 'Əsas', '1')]);
  const n = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.equal(n.tapildi, 2);
  assert.deepEqual([acar(db, 'd'), acar(db, 'm')], ['stat_05', 'tam_1']);
  assert.equal(n.coxmenali.length, 0);
});

test('Excel-də eyni adlı iki adam, bazada bir qeyd — vəzifəsi uyğun olan, digəri "sistemdə yoxdur"', async () => {
  const db = baza([['d', 'Ali', 'Veliyev', 'DOSENT']]);
  const buf = await excelQur(BASLIQ, [tamSetir('Əli', 'Vəliyev', 'Rasim', 'Fizika kafedrası', 'Dosent', 'Əsas', '0.5'),
    tamSetir('Əli', 'Vəliyev', 'Kamil', 'Kimya kafedrası', 'Baş müəllim')]);
  const n = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.equal(n.tapildi, 1);
  assert.equal(acar(db, 'd'), 'stat_05');
  assert.deepEqual(n.yoxdur.map((s) => s.ata), ['Kamil']);
});

test('HR-in təsdiqi yadda qalır: növbəti yükləmədə avtomatik tapılır', async () => {
  const db = baza([['leyla', 'Leyla', 'Hesenova']]);
  const buf = await excelQur(BASLIQ, [setir('Leyla', 'Hüsənova', '', 'Əsas', '0.5')]);
  const n1 = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.equal(n1.ehtimal.length, 1);
  eslemeYaz(db, n1.ehtimal[0].sexs.setirler[0], 'leyla', 't');
  const n2 = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.deepEqual([n2.tapildi, n2.ehtimal.length, n2.excelsiz.length], [1, 0, 0]);
  assert.equal(acar(db, 'leyla'), 'stat_05');
});

test('ata adı fərqlidirsə ehtimal səbəbi "ata"', async () => {
  const db = baza([['ali', 'Ali', 'Veliyev']]);
  db.prepare("UPDATE emekdaslar SET ata = 'Kamil' WHERE id = 'ali'").run();
  const n = await kadrYukle(db, await excelQur(BASLIQ, [setir('Əli', 'Vəliyev', 'Rasim')]), { bas: '2026-11-03', kim: 't' });
  assert.deepEqual(n.ehtimal.map((x) => [x.sebeb, x.namizedler.map((c) => c.id)]), [['ata', ['ali']]]);
});

test('ehtimal: 2 hərf fərq (vəzifə uyğundursa) və iki sözlü ad', async () => {
  const db = baza([['n', 'Nulifer', 'Qasimova', 'BAS-MUELLIM'], ['r', 'Rahid', 'Aliyev', 'MUELLIM'], ['m', 'Marco', 'Bellini', 'MUELLIM']]);
  const buf = await excelQur(BASLIQ, [tamSetir('Nilufər', 'Qasımova', 'Kamal', 'Fizika kafedrası', 'Baş müəllim'),
    tamSetir('Rəşad', 'Əliyev', 'Yavər', 'Kimya kafedrası', 'Dosent'),
    tamSetir('Marco Luca', 'Bellini', '', 'Xarici dillər kafedrası', 'Baş müəllim')]);
  const n = await kadrYukle(db, buf, { bas: '2026-11-03', kim: 't' });
  assert.deepEqual(n.ehtimal.map((x) => [x.sexs.soyad, x.namizedler.map((c) => c.id)]).sort(), [['Bellini', ['m']], ['Qasımova', ['n']]]);
  assert.deepEqual(n.yoxdur.map((s) => s.soyad), ['Əliyev']);                  // 2 hərf fərq, amma vəzifə fərqli
});
