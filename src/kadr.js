// Kadr Excel-i (HR-in rəsmi işçi siyahısı): oxuma, kamera bazasındakı əməkdaşlarla ad üzrə uyğunlaşdırma və iş
// qrafiki şablonunun təyini. Yalnız lazımi sütunlar oxunur — Pin kod (FİN), təvəllüd, cins heç oxunmur və saxlanmır.
import ExcelJS from 'exceljs';
import { emeliyyat, indiYaz } from './db.js';
import { SorguXetasi } from './hesabat.js';
import { qrafikTap, qrafikYaz } from './qrafik.js';

const MAKS_SETIR = 20_000;
// başlıqlar qatla() ilə tutuşdurulur: latın klaviaturasında yazılan "I" (Işçi qrup) və böyük hərflər də tanınsın
const basliqNormal = (s) => qatla(s);
// açar → Excel başlığı; məcburi olanlar olmasa yükləmə rədd edilir
const SUTUNLAR = {
  ad: ['Adı', true], soyad: ['Soyadı', true], ata: ['Atasının adı', false], muessise: ['Müəssisənin adı', false],
  vezife: ['Vəzifəsi', false], isci_qrup: ['İşçi qrup', false], tip: ['İşçilərin tipi', true],
  stat: ['Ştat vahidi', true], cixis: ['İşdən çıxma sən. tarixi', false], is_vaxti: ['İş vaxtı', true],
};

/**
 * Müqayisə üçün ad: kamera bazasında adlar latınca yazılıb ("ə" adətən "e": Həsənov → Hesenov, bəzən "a": Hasanov),
 * kadr siyahısında isə Azərbaycan əlifbası ilədir. Ona görə ə/a/e bir hərf sayılır; sh/ch/j kimi ingilis yazılışları da.
 */
export function qatla(s) {
  return String(s ?? '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase()
    .replace(/[əa]/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/sh/g, 's').replace(/ch/g, 'c').replace(/gh/g, 'g').replace(/j/g, 'c').replace(/w/g, 'v')
    .replace(/[^a-z]/g, '');
}

/** ExcelJS xanası → mətn (zəngin mətn, düstur nəticəsi, tarix) */
function metn(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((x) => x.text).join('').trim();
    if ('result' in v) return metn(v.result);
    if ('text' in v) return String(v.text).trim();
  }
  return String(v).trim();
}

const statOxu = (v) => {
  const n = Number(metn(v).replace(',', '.'));
  return metn(v) === '' || Number.isNaN(n) ? null : n;
};

/** "15.08.2026" və ya Excel tarixi → "2026-08-15"; tanınmırsa null */
function tarixOxu(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(metn(v));
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(metn(v)) ? metn(v).slice(0, 10) : null;
}

export async function kadrOxu(buf) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new SorguXetasi('Excel faylı oxunmadı (.xlsx olmalıdır)');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new SorguXetasi('Excel faylı oxunmadı: vərəq yoxdur');
  const yer = new Map();
  ws.getRow(1).eachCell((c, i) => yer.set(basliqNormal(metn(c.value)), i));
  const sutun = {};
  for (const [acar, [ad, mecburi]] of Object.entries(SUTUNLAR)) {
    const i = yer.get(basliqNormal(ad));
    if (!i && mecburi) throw new SorguXetasi(`Excel-də '${ad}' sütunu yoxdur`);
    sutun[acar] = i;
  }
  if (ws.rowCount > MAKS_SETIR + 1) throw new SorguXetasi(`Excel-də ən çox ${MAKS_SETIR} sətir ola bilər`);
  const setirler = [];
  let bos = 0;
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const al = (acar) => (sutun[acar] ? row.getCell(sutun[acar]).value : null);
    const s = {
      ad: metn(al('ad')), soyad: metn(al('soyad')), ata: metn(al('ata')), muessise: metn(al('muessise')),
      vezife: metn(al('vezife')), isci_qrup: metn(al('isci_qrup')), tip: metn(al('tip')), stat: statOxu(al('stat')),
      is_vaxti: metn(al('is_vaxti')), cixis: tarixOxu(al('cixis')),
    };
    if (!s.ad && !s.soyad && !s.tip) continue;               // tam boş sətir
    if (!s.ad || !s.soyad) { bos += 1; continue; }
    setirler.push(s);
  }
  return { setirler, xeberdarliqlar: bos ? [`${bos} sətirdə ad və ya soyad yoxdur — atıldı`] : [] };
}

/** Qrafik götürülən sətir: "Əsas" iş yeri; yoxdursa ən böyük ştat; bərabərdirsə birinci */
export function esasSetir(setirler) {
  const esas = setirler.find((s) => qatla(s.tip) === 'eses');
  if (esas) return esas;
  return setirler.reduce((a, b) => ((b.stat ?? 0) > (a.stat ?? 0) ? b : a));
}

const STAT_SABLON = [[1, 'tam_1'], [0.75, 'stat_075'], [0.5, 'stat_05'], [0.25, 'stat_025']];

export function sablonAcari(s) {
  const vaxt = qatla(s.is_vaxti);
  if (vaxt === 'qiseldilmis') return { acar: 'qisaldilmis' };
  if (vaxt === 'netemem') return { acar: 'natamam' };
  const uygun = STAT_SABLON.find(([st]) => s.stat !== null && Math.abs(s.stat - st) < 1e-6);
  if (uygun) return { acar: uygun[1] };
  return { acar: 'tam_1', xeberdarliq: `ştat vahidi "${s.stat ?? ''}" tanınmadı — "Tam, 1 ştat" təyin olundu` };
}

/** Levenshtein məsafəsi ≤ 1 (bir hərf əlavə, silinmə və ya dəyişmə) */
function birFerq(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length > b.length) [a, b] = [b, a];
  let i = 0;
  let j = 0;
  let f = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    f += 1;
    if (f > 1) return false;
    if (a.length === b.length) i += 1;
    j += 1;
  }
  return f + (b.length - j) <= 1;
}

const namized = (e) => ({ id: e.id, ad: e.ad, soyad: e.soyad, ata: e.ata, sobe: e.sobe, vezife: e.vezife });

/** Excel şəxsinin açarı (HR təsdiqləri bununla yadda saxlanır) */
export const sexsAcari = (s) => `${qatla(s.ad)}|${qatla(s.soyad)}|${qatla(s.ata)}`;

/**
 * Bazadakı qeydin Excel şəxsinə nə qədər uyğun olduğu: vəzifə (bazada "qrup" sütunu: DOSENT, BAS-MUELLIM) Excel-in
 * "Vəzifəsi" ilə üst-üstə düşürsə 2, şöbə adı "Müəssisənin adı"nda keçirsə +1. Eyni adlı adamları ayırmaq üçündür.
 */
function uygunluqBali(e, sexs) {
  const v = qatla(e.vezife);
  const sb = qatla(e.sobe);
  let bal = 0;
  for (const s of sexs.setirler) {
    const sv = qatla(s.vezife);
    const sm = qatla(s.muessise);
    const sobeUygun = (sb.length >= 4 && sm.includes(sb)) || (v.length >= 4 && sm.includes(v));
    const vezifeUygun = v && sv && (v === sv || birFerq(v, sv) || sv.startsWith(v) || v.startsWith(sv));
    bal = Math.max(bal, (vezifeUygun ? 2 : 0) + (sobeUygun ? 1 : 0));
  }
  return bal;
}

/**
 * Excel şəxslərini aktiv əməkdaşlarla tutuşdurur (yazmır). Ardıcıllıq:
 *  1. HR-in əvvəlki təsdiqləri (kadr_esleme) — ad necə yazılsa da həmin əməkdaş;
 *  2. ad+soyad eyni olanlar. Kamera bazasında eyni adamın bir neçə qeydi ola bilər (vəzifə fərqli yazılıb, iki iş yeri):
 *     Excel-də o adda bir nəfər varsa, qrafik hamısına yazılır (vəzifəsi uyğun gələnlər varsa — yalnız onlara);
 *     Excel-də eyni adlı bir neçə adam varsa — vəzifə/şöbəyə görə ayrılır, ayrılmayanlar "çoxmənalı" qalır;
 *  3. ad və ya soyad 1 hərf fərqli — "ehtimal", HR təsdiqləyir.
 * Ata adı hər iki tərəfdə varsa, uyğun gəlməlidir (kamera bazasında əməkdaşların çoxunda ata adı yoxdur).
 */
export function uygunlasdir(db, setirler, bas) {
  let isdenCixib = 0;
  const sexsMap = new Map();
  for (const s of setirler) {
    if (s.cixis && s.cixis <= bas) { isdenCixib += 1; continue; }
    const acar = sexsAcari(s);
    if (!sexsMap.has(acar)) sexsMap.set(acar, { ad: s.ad, soyad: s.soyad, ata: s.ata, setirler: [] });
    sexsMap.get(acar).setirler.push(s);
  }
  const emekdaslar = db.prepare('SELECT id, ad, soyad, ata, sobe, vezife FROM emekdaslar WHERE aktiv = 1 ORDER BY id').all()
    .map((e) => ({ ...e, qa: qatla(e.ad), qs: qatla(e.soyad), qt: qatla(e.ata) }));
  const idile = new Map(emekdaslar.map((e) => [e.id, e]));
  const indeks = new Map();
  for (const e of emekdaslar) {
    const a = `${e.qa}|${e.qs}`;
    if (!indeks.has(a)) indeks.set(a, []);
    indeks.get(a).push(e);
  }
  const tapildi = [];
  const tutulub = new Set();
  const tap = (e, sexs) => { tapildi.push({ emekdas: e, sexs }); tutulub.add(e.id); };

  // 1. əvvəlki təsdiqlər
  const esleme = db.prepare('SELECT emekdas_id FROM kadr_esleme WHERE sexs_acar = ?');
  const qruplar = new Map();
  for (const [acar, sexs] of sexsMap) {
    const evvel = esleme.all(acar).map((r) => idile.get(r.emekdas_id)).filter((e) => e && !tutulub.has(e.id));
    if (evvel.length) { evvel.forEach((e) => tap(e, sexs)); continue; }
    const k = `${qatla(sexs.ad)}|${qatla(sexs.soyad)}`;
    if (!qruplar.has(k)) qruplar.set(k, []);
    qruplar.get(k).push(sexs);
  }

  // 2. ad+soyad eyni
  const uyar = (e, sexs) => { const qt = qatla(sexs.ata); return !qt || !e.qt || e.qt === qt; };
  const ehtimal = [];
  const coxmenali = [];
  const yoxdur = [];
  const yazilisaQalan = [];
  for (const [k, sexsler] of qruplar) {
    const hamisi = (indeks.get(k) ?? []).filter((e) => !tutulub.has(e.id));
    if (!hamisi.length) { yazilisaQalan.push(...sexsler); continue; }
    const verilen = new Map(sexsler.map((s) => [s, []]));
    const ayrilmayan = [];
    for (const e of hamisi) {
      const uygun = sexsler.filter((s) => uyar(e, s));
      if (!uygun.length) continue;
      const ballar = uygun.map((s) => uygunluqBali(e, s));
      const max = Math.max(...ballar);
      const enYaxsi = uygun.filter((_, i) => ballar[i] === max);
      if (enYaxsi.length === 1 && (max > 0 || uygun.length === 1)) verilen.get(enYaxsi[0]).push({ e, bal: max });
      else ayrilmayan.push({ e, uygun });
    }
    const verildi = new Set();
    for (const s of sexsler) {
      let al = verilen.get(s);
      // Excel-də bu adda bir nəfərdirsə, bazadakı bütün qeydlər onundur (eyni adamın vəzifəsi fərqli yazılmış qeydləri).
      // Bir neçə adaş varsa, vəzifəsi uyğun gəlməyən qeyd başqa adam ola bilər — "Excel-də yoxdur"da qalır.
      if (sexsler.length > 1) {
        const hedd = al.some((x) => x.bal >= 2) ? 2 : Number(al.some((x) => x.bal > 0));
        al = al.filter((x) => x.bal >= hedd);
      }
      verilen.set(s, al);
      for (const { e } of al) { tap(e, s); verildi.add(e.id); }
    }
    for (const s of sexsler) {
      if (verilen.get(s).length) continue;
      const namizedler = ayrilmayan.filter((x) => x.uygun.includes(s) && !verildi.has(x.e.id)).map((x) => x.e);
      const ataFerqli = hamisi.filter((e) => !uyar(e, s) && !verildi.has(e.id));
      if (namizedler.length) coxmenali.push({ sexs: s, namizedler: namizedler.map(namized) });
      else if (ataFerqli.length) ehtimal.push({ sexs: s, sebeb: 'ata', namizedler: ataFerqli.map(namized) });
      else yoxdur.push(s);
    }
  }

  // 3. yazılış fərqi — yalnız hələ heç kimə düşməmiş əməkdaşlar arasında
  for (const sexs of yazilisaQalan) {
    const [qa, qs] = [qatla(sexs.ad), qatla(sexs.soyad)];
    const yaxin = emekdaslar.filter((e) => !tutulub.has(e.id) && ((e.qa === qa && birFerq(e.qs, qs))
      || (e.qs === qs && birFerq(e.qa, qa)) || (e.qa === qs && e.qs === qa)));
    if (yaxin.length) ehtimal.push({ sexs, sebeb: 'yazilis', namizedler: yaxin.map(namized) });
    else yoxdur.push(sexs);
  }
  const toxunulan = new Set([...tutulub, ...[...ehtimal, ...coxmenali].flatMap((x) => x.namizedler.map((c) => c.id))]);
  const excelsiz = emekdaslar.filter((e) => !toxunulan.has(e.id)).map(namized);
  return { sexsler: [...sexsMap.values()], tapildi, ehtimal, coxmenali, yoxdur, excelsiz, isdenCixib };
}

/** HR-in təsdiqi: bu Excel şəxsi (ad, soyad, ata) həmin əməkdaşdır — növbəti yükləmələrdə avtomatik uyğunlaşır */
export function eslemeYaz(db, setir, emekdasId, kim) {
  db.prepare(`INSERT INTO kadr_esleme (sexs_acar, emekdas_id, kim, yaradilib) VALUES (?, ?, ?, ?)
    ON CONFLICT (sexs_acar, emekdas_id) DO UPDATE SET kim = excluded.kim, yaradilib = excluded.yaradilib`)
    .run(sexsAcari(setir), emekdasId, kim, indiYaz());
}

/**
 * Bir əməkdaşa Excel-dən qrafik: həmin tarixdə əl ilə qoyulmuş qrafik varsa toxunulmur (HR-in qərarı üstündür);
 * eyni şablondursa yazılmır (tarixçə boş sətirlərlə dolmasın). Kadr məlumatı həmişə yenilənir.
 * Bu tarixdən sonrakı Excel qrafikləri silinir: yeni yükləmə köhnəsini əvəz edir (məs. tarix səhv seçilib yenidən
 * daha erkən tarixlə yüklənəndə), əks halda köhnə yükləmə sonrakı günlərdə qüvvədə qalardı. Əl ilə qoyulanlar qalır.
 */
export function kadrTetbiqEt(db, { emekdasId, setirler, bas, kim }) {
  const esas = esasSetir(setirler);
  const { acar } = sablonAcari(esas);
  const sablonId = db.prepare('SELECT id FROM qrafik_sablonlari WHERE acar = ?').get(acar).id;
  db.prepare("DELETE FROM emekdas_qrafik WHERE emekdas_id = ? AND bas > ? AND menbe = 'excel'").run(emekdasId, bas);
  const indi = qrafikTap(db, { isBaslama: null, isBitme: null }, emekdasId, bas);
  let netice = 'yazildi';
  if (indi.menbe === 'el') netice = 'qorundu';
  else if (indi.sablonId === sablonId) netice = 'deyismedi';
  else qrafikYaz(db, { emekdasId, bas, sablonId, menbe: 'excel', kim });
  db.prepare('DELETE FROM kadr_melumati WHERE emekdas_id = ?').run(emekdasId);
  const yaz = db.prepare(`INSERT INTO kadr_melumati (emekdas_id, sira, muessise, vezife, isci_qrup, tip, stat, is_vaxti, yuklenib)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const yuklenib = indiYaz();
  [esas, ...setirler.filter((s) => s !== esas)].forEach((s, i) => yaz.run(emekdasId, i, s.muessise, s.vezife, s.isci_qrup,
    s.tip, s.stat, s.is_vaxti, yuklenib));
  return netice;
}

export async function kadrYukle(db, buf, { bas, kim }) {
  const { setirler, xeberdarliqlar } = await kadrOxu(buf);
  const u = uygunlasdir(db, setirler, bas);
  const say = { yazildi: 0, deyismedi: 0, qorundu: 0 };
  const xeberdar = new Set();
  emeliyyat(db, () => {
    for (const t of u.tapildi) {
      say[kadrTetbiqEt(db, { emekdasId: t.emekdas.id, setirler: t.sexs.setirler, bas, kim })] += 1;
      const x = sablonAcari(esasSetir(t.sexs.setirler)).xeberdarliq;
      if (x && !xeberdar.has(t.sexs) && xeberdar.add(t.sexs)) xeberdarliqlar.push(`${t.sexs.ad} ${t.sexs.soyad}: ${x}`);
    }
  });
  return {
    bas, cemi: u.sexsler.length, tapildi: u.tapildi.length, ...say, isdenCixib: u.isdenCixib, xeberdarliqlar,
    ehtimal: u.ehtimal, coxmenali: u.coxmenali, yoxdur: u.yoxdur, excelsiz: u.excelsiz,
  };
}
