# İş qrafiki — icra planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hər əməkdaşın tarixli iş qrafiki (şablon və ya fərdi saat), kadr Excel-indən avtomatik təyinat və gecikmə/erkən
çıxışın bu qrafikə görə hesablanması.

**Architecture:** Yeni cədvəllər `src/db.js`-də; qrafikin tapılması `src/qrafik.js`-də (təmiz funksiyalar + toplu
yükləmə); Excel oxuma/uyğunlaşdırma `src/kadr.js`-də; yeni API `src/qrafikApi.js` (apiRouter-in sessiya qatından sonra
qoşulur); hesabat `gunSetri`-yə əməkdaşın günlük saatını ötürür, `gunHesabla` dəyişmir; panel `public/static/app.js`.

**Tech Stack:** Node ≥22.13, Express 5, `node:sqlite`, `exceljs`, `node:test`. Çərçivəsiz brauzer JS.

**Spec:** `docs/superpowers/specs/2026-11-03-is-qrafiki-design.md`

## Global Constraints

- Yeni asılılıq yoxdur.
- Excel-dəki `Pin kod`, `Təvəllüdü`, `Cinsi` sütunları oxunmur, cavabda və bazada heç vaxt olmur.
- Testlərdə yalnız uydurma adlar (Əli Vəliyev, Leyla Həsənova, Rəşad Cəlilov...); real ad, FİN, IP yoxdur.
- Kodda Azərbaycanca ASCII adlandırma, şərhlər Azərbaycanca, "niyə" izah olunur (repo üslubu).
- Şablonlar (açar, ad, saat): `tam_1` "Tam, 1 ştat" 09:00–17:30; `stat_075` "Tam, 0,75 ştat" 09:00–16:00; `stat_05` "Tam,
  0,5 ştat" 09:00–13:00; `stat_025` "Tam, 0,25 ştat" 09:00–11:00; `qisaldilmis` "Qısaldılmış" 09:00–16:30; `natamam`
  "Natamam" 09:00–13:00. İlk saat sətri `bas = '2000-01-01'`, `kim = 'sistem'`.
- Təyinat yoxdursa `.env` saatı (`k.isBaslama`/`k.isBitme`), qrafik adı `"Standart"`.
- Dəyişən sorğular `X-Aztu: 1` başlığı tələb edir (mövcud middleware).
- Testlər: `npm test` (hamısı yaşıl qalmalıdır).

## Review Focus

1. Eyni gün iki dəyişiklik (eyni `bas`) — ikincisi birincini əvəz etməlidir, PRIMARY KEY xətası yox → Task 1/5 testi.
2. Gələcək tarixli təyinat bu günün hesabatını dəyişməməlidir → Task 2 testi.
3. Ştat Excel-də mətn `"0.50"` / rəqəm `0.5` / vergüllü `"0,5"` gəlir — hamısı `stat_05` → Task 4 testi.
4. Excel-də başlıq sütun adlarında artıq boşluq/fərqli böyük-kiçik hərf → Task 4 testi.
5. Yenidən yükləmədə əl ilə dəyişilmiş qrafik qorunmalı, Excel mənbəli isə yenilənməlidir → Task 4 testi.

---

### Task 1: Cədvəllər və şablonların ilkin yazılması

**Files:**
- Modify: `src/db.js` (SXEM, `bazaAc`)
- Test: `test/qrafik.test.js` (yeni)

**Interfaces:**
- Produces: cədvəllər `qrafik_sablonlari`, `sablon_saatlari`, `emekdas_qrafik`, `kadr_melumati` — sütunlar spec-dəki
  SQL ilə eyni; `export const SABLONLAR = [{acar, ad, baslama, bitme}, ...]` (Global Constraints-dəki sıra ilə, `sira`
  = indeks); `bazaAc` şablon yoxdursa yaradır (təkrar açanda ikiqat yazmır).

- [ ] **Step 1: Failing test** — `test/qrafik.test.js`:
  - `'baza açılanda 6 şablon yaranır, təkrar açanda ikiqat olmur'`: `bazaAc(':memory:')` → `SELECT acar FROM
    qrafik_sablonlari ORDER BY sira` = `['tam_1','stat_075','stat_05','stat_025','qisaldilmis','natamam']`;
    `sablon_saatlari`-da `tam_1` üçün `{bas:'2000-01-01', baslama:'09:00', bitme:'17:30', kim:'sistem'}`; fayl bazası
    (müvəqqəti qovluq) iki dəfə açılanda sətir sayı 6 qalır.
- [ ] **Step 2:** `npm test` → yeni test FAIL.
- [ ] **Step 3:** SXEM-ə 4 cədvəli əlavə et; `bazaAc`-da `INSERT OR IGNORE` ilə şablon + ilk saat (`emeliyyat` daxilində).
- [ ] **Step 4:** `npm test` → hamısı PASS.
- [ ] **Step 5: Commit** — `git add src/db.js test/qrafik.test.js && git commit -m "İş qrafiki: cədvəllər və şablonlar"`

### Task 2: Qrafikin tapılması (`src/qrafik.js`)

**Files:**
- Create: `src/qrafik.js`
- Test: `test/qrafik.test.js`

**Interfaces:**
- Consumes: Task 1 cədvəlləri.
- Produces:
  - `qrafikXeritesi(db, k, ids: string[], bas: string, son: string) => (emekdasId, tarix) => {isBaslama, isBitme, ad,
    menbe, sablonId}` — `emekdas_qrafik` (ids üçün, `bas <= son`) və `sablon_saatlari` hər biri bir sorğu ilə; aralıqdan
    əvvəl qüvvəyə minmiş son sətir də daxil edilməlidir. `menbe`: `'excel'|'el'|null`, `sablonId`: rəqəm və ya `null`.
    Fərdi qrafikdə `ad = 'Fərdi'`, təyinatsız `ad = 'Standart'`.
  - `qrafikTap(db, k, emekdasId, tarix)` — eyni nəticə, tək əməkdaş.
  - `sablonSaati(db, sablonId, tarix) => {baslama, bitme}`.
  - `qrafikYaz(db, {emekdasId, bas, sablonId=null, baslama=null, bitme=null, menbe, kim})` — upsert `(emekdas_id, bas)`.
  - `sablonSaatYaz(db, {sablonId, bas, baslama, bitme, kim})` — upsert `(sablon_id, bas)`.
  - `SAAT = /^([01]\d|2[0-3]):[0-5]\d$/` və `saatYoxla(baslama, bitme)` — format + `baslama < bitme`, səhvdə
    `SorguXetasi` (`src/hesabat.js`-dən) atır.

- [ ] **Step 1: Failing tests**:
  - `'təyinat yoxdursa .env saatı'`: `qrafikTap(db, {isBaslama:'09:00', isBitme:'18:00'}, 'a', '2026-11-02')` →
    `{isBaslama:'09:00', isBitme:'18:00', ad:'Standart', menbe:null, sablonId:null}`.
  - `'tarixli təyinat: dəyişiklikdən əvvəlki gün köhnə qrafiklə'`: `qrafikYaz` `tam_1` `bas 2026-10-01`, sonra
    `stat_05` `bas 2026-11-01` → `2026-10-31` = 09:00/17:30 "Tam, 1 ştat"; `2026-11-01` = 09:00/13:00 "Tam, 0,5 ştat".
  - `'şablon saatının tarixçəsi'`: `sablonSaatYaz(tam_1, bas 2026-11-03, 08:30, 17:00)` → 11-02 = 09:00/17:30, 11-03 =
    08:30/17:00.
  - `'fərdi saat'`: `qrafikYaz({baslama:'10:00', bitme:'15:00', menbe:'el'})` → `ad:'Fərdi'`, `menbe:'el'`.
  - `'eyni gün iki dəyişiklik: ikincisi əvəz edir'`: eyni `bas` ilə iki `qrafikYaz` → xəta yox, ikincinin saatı.
  - `'gələcək tarixli təyinat bu günü dəyişmir'`: `bas` = sabah → bu gün `Standart`.
  - `'xəritə aralıqdan əvvəlki təyinatı görür və qrafikTap ilə eynidir'`: iki əməkdaş, aralıq 10-25..11-05, təyinatlar
    10-01 və 11-01 → hər gün üçün `qrafikXeritesi(...)(id, t)` `qrafikTap(...)` ilə `deepEqual`.
  - `'saatYoxla'`: `('17:30','09:00')` və `('9:00','17:00')` `SorguXetasi` atır.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** `src/qrafik.js`-i yaz. Xəritə: hər əməkdaş üçün `bas`-a görə sıralı siyahı, gün üçün son `bas <= tarix`
  (ikili axtarış və ya xətti — siyahılar qısadır).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "İş qrafiki: tarixli qrafikin tapılması"`

### Task 3: Hesabat qrafiki işlədir

**Files:**
- Modify: `src/hesabat.js` (`gunSetri`, `hesabatQur`), `src/api.js` (`/umumi`, `/emekdaslar`, `/emekdaslar/:id`, `/men`
  dəyişmir), `src/excel.js` (gün vərəqinə "Qrafik", xülasəyə "Qrafik")
- Test: `test/hesabat.test.js`, `test/api.test.js`

**Interfaces:**
- Consumes: `qrafikXeritesi`, `qrafikTap`.
- Produces: `gunSetri(tarix, hadiseler, q, bugun, indiSaat)` — `q = {isBaslama, isBitme, ad}` (köhnə `k` də bu
  formadadır, ona görə çağıran yerlər pozulmur); nəticədə `qrafik: {ad, baslama, bitme}`. `hesabatQur` xülasə
  elementinə `qrafik` (aralığın son günündəki `{ad, baslama, bitme}`). Excel gün vərəqi: `Vəziyyət`-dən əvvəl
  `{header:'Qrafik', key:'qrafik', width:13}` dəyəri `"09:00–17:30"`; xülasə vərəqi `Vəzifə`-dən sonra
  `{header:'Qrafik', key:'qrafik', width:22}` dəyəri `"Tam, 1 ştat (09:00–17:30)"`.

- [ ] **Step 1: Failing tests**:
  - `test/hesabat.test.js` `'gecikmə və erkən çıxış əməkdaşın öz qrafikinə görə, dəyişiklikdən əvvəlki gün köhnə ilə'`:
    əməkdaş `a`, `stat_05` `bas 2026-10-28`; 10-27 09:30 giriş/17:00 çıxış → `gecikmeSan 1800`, `erkenCixisSan 3600`
    (Standart 09:00–18:00); 10-28 09:30/12:00 → `gecikmeSan 1800`, `erkenCixisSan 3600` (13:00), `qrafik.ad`
    `"Tam, 0,5 ştat"`.
  - `test/api.test.js` `'bu gün diqqət: gecikmə fərdi saata görə'`: `qrafikYaz` fərdi 10:00–15:00 `bas` = bu gün,
    09:45 giriş → `/api/umumi` `bugun.siyahi.geciken`-də yoxdur; `/api/emekdaslar/:id` `bugun.qrafik.baslama === '10:00'`;
    `/api/hesabat/excel?emekdas=<id>` gün vərəqində "Qrafik" sütununun dəyəri `"10:00–15:00"`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** `hesabatQur`: `const q = qrafikXeritesi(db, k, ids, bas, son)`, hər gün `gunSetri(tarix, h, q(e.id,
  tarix), ...)`. `/umumi` və `/emekdaslar`: bu gün üçün `qrafikXeritesi(db, k, ids, bugun, bugun)`; `/emekdaslar/:id`:
  `qrafikTap`. Excel sütunları.
- [ ] **Step 4:** `npm test` → PASS (köhnə testlər də).
- [ ] **Step 5: Commit** — `git commit -m "Hesabat əməkdaşın iş qrafikinə görə: gecikmə, erkən çıxış, Excel sütunu"`

### Task 4: Kadr Excel-i — oxuma, uyğunlaşdırma, təyinat (`src/kadr.js`)

**Files:**
- Create: `src/kadr.js`
- Test: `test/kadr.test.js` (yeni)

**Interfaces:**
- Consumes: `qrafikTap`, `qrafikYaz`, `emeliyyat`, `SorguXetasi`, `indiYaz`.
- Produces:
  - `qatla(s: string) => string` — spec-dəki qatlama qaydası.
  - `async kadrOxu(buf: Buffer) => {setirler: KadrSetri[], xeberdarliqlar: string[]}`; `KadrSetri = {ad, soyad, ata,
    muessise, vezife, isci_qrup, tip, stat: number|null, is_vaxti, cixis: string|null}` (`cixis` — YYYY-MM-DD). Məcburi
    sütun yoxdursa `SorguXetasi("Excel-də '<sütun>' sütunu yoxdur")`; oxunmayan fayl `SorguXetasi('Excel faylı
    oxunmadı')`. Sütun başlığı `trim` + kiçik hərflə tutuşdurulur. Tarix sütunu `DD.MM.YYYY` mətni və ya Excel tarixi.
  - `esasSetir(setirler: KadrSetri[]) => KadrSetri` — tip `Əsas` (qatlanmış `esas`); yoxdursa max ştat; bərabərdə birinci.
  - `sablonAcari(s: KadrSetri) => {acar, xeberdarliq?}` — `is_vaxti` qatlanmışı `qisaldilmis` → `qisaldilmis`, `natamam`
    → `natamam`; əks halda ştat 1/0.75/0.5/0.25 → `tam_1`/`stat_075`/`stat_05`/`stat_025`; başqa → `tam_1` +
    xəbərdarlıq. Ştat `"0.50"`, `"0,5"`, `0.5` eyni.
  - `uygunlasdir(db, setirler, bas) => {sexsler: [{acar, setirler}], tapildi: [{emekdas, sexs}], ehtimal: [{sexs,
    namizedler}], coxmenali: [{sexs, namizedler}], yoxdur: [sexs], isdenCixib: number}` — yalnız `aktiv = 1` əməkdaşlar;
    `namizedler` elementləri `{id, ad, soyad, ata, sobe, vezife}`.
  - `kadrTetbiqEt(db, {emekdasId, setirler, bas, kim}) => 'yazildi'|'deyismedi'|'qorundu'` — spec "Təyinat" qaydası +
    `kadr_melumati` yenilənməsi (`sira 0` = `esasSetir`).
  - `async kadrYukle(db, buf, {bas, kim}) => {bas, cemi, tapildi, yazildi, deyismedi, qorundu, isdenCixib,
    xeberdarliqlar, ehtimal, coxmenali, yoxdur}` — `cemi` = şəxs sayı; tətbiq bir `emeliyyat`-da. Siyahılardakı
    şəxs = `{ad, soyad, ata, setirler}`.

- [ ] **Step 1: Failing tests** (`test/kadr.test.js`; Excel faylı testdə `ExcelJS` ilə yaddaşda qurulur, köməkçi
  `excelQur(basliqlar, setirler)`):
  - `'qatla: ə=e=a, ş=sh, c=j'`: `qatla('Həsənov') === qatla('Hesenov')`, `qatla('Cəlilov') === qatla('Jalilov')`,
    `qatla('Haşımlı') === qatla('Hashimli')`.
  - `'sütunlar başlıq adına görə, sıra və boşluq fərq etmir; FİN oxunmur'`: başlıqlar `[' İş vaxtı ', 'Pin kod', 'Adı',
    'Soyadı', 'Ştat vahidi', 'İşçilərin tipi', 'Təvəllüdü']`, `Pin kod = 'ZZZ9999'` → nəticə JSON-unda `ZZZ9999` yoxdur.
  - `'məcburi sütun yoxdursa aydın xəta'`: `Ştat vahidi` yoxdur → `SorguXetasi`, mesajda `Ştat vahidi`.
  - `'Əsas sətir və şablon'`: [Daxili əvəzçi 0.5, Əsas 1] → Əsas; [Müqavilə 0.25, Müqavilə 0.5] → 0.5; `"0.50"`,
    `"0,5"`, `0.5` → `stat_05`; `Qisaldılmış` → `qisaldilmis`; ştat `0.4` → `tam_1` + xəbərdarlıq.
  - `'uyğunlaşdırma: tapıldı / ehtimal / çoxmənalı / yoxdur'`: aktiv əməkdaşlar `Ali Veliyev` (fayl adı kimi latın),
    `Leyla Hesenova`, iki `Rəşad Cəlilov` (fərqli vəzifə), deaktiv `Kamran Quliyev`; Excel: `Əli Vəliyev` → tapıldı,
    `Leyla Həsənovə` (1 hərf) → ehtimal, `Rəşad Cəlilov` → çoxmənalı (2 namizəd), `Kamran Quliyev` → yoxdur, `Nigar
    Abbasova` → yoxdur.
  - `'işdən çıxma tarixi keçibsə atılır'`: `cixis = 2026-10-01`, `bas = 2026-11-03` → `isdenCixib 1`, heç bir siyahıda yox.
  - `'yenidən yükləmə: əl ilə dəyişən qorunur, Excel mənbəli yenilənir, eyni şablon yazılmır'`: ilk yükləmə (ikisi
    `tam_1`) → `yazildi 2`; birinə `qrafikYaz(menbe 'el')`; ikinci yükləmə ikisi də `stat_05` → `qorundu 1, yazildi 1`;
    üçüncü eyni fayl → `deyismedi 1, qorundu 1`.
  - `'kadr_melumati: Əsas sətir sira 0, əvəzçilik sira 1'`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** `src/kadr.js`-i yaz. Levenshtein ≤ 1 köməkçisi daxilidir; "ad/soyad yeri dəyişib" də ehtimal.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Kadr Excel-i: oxuma, ad uyğunlaşdırması, şablon təyinatı"`

### Task 5: API (`src/qrafikApi.js`)

**Files:**
- Create: `src/qrafikApi.js`
- Modify: `src/api.js` (sessiya middleware-dən sonra, xəta işləyicisindən əvvəl `r.use(qrafikRouter(db, k, log))`)
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: Task 2 və Task 4 funksiyaları; `araliq`/`SorguXetasi`; `excelYaz` üslubu.
- Produces (spec "API" bölməsi ilə eyni yollar və cavab formaları):
  - `GET /qrafik/sablonlar`, `POST /qrafik/sablonlar/:id/saat`
  - `GET /emekdaslar/:id/qrafik`, `POST /emekdaslar/:id/qrafik`
  - `POST /kadr/yukle?bas=` — `express.raw({type: () => true, limit: '5mb'})` yalnız bu yolda; boş gövdə → 400.
  - `POST /kadr/tesdiq`, `POST /kadr/excel` (cavab `.xlsx`, sütunlar: Adı, Soyadı, Atasının adı, Müəssisənin adı,
    Vəzifəsi, İşçi qrup, İşçilərin tipi, Ştat vahidi, İş vaxtı).
  - `bas` yoxdursa bu gün; tarix `araliq({bas})` ilə yoxlanır. `kim = req.istifadeci.ad`. Hər dəyişiklik `log.info`.

- [ ] **Step 1: Failing tests** (`test/api.test.js`):
  - `'qrafik: şablonlar, saat dəyişikliyi tarixlə, əməkdaşa fərdi saat'`: `GET /api/qrafik/sablonlar` → 6 element,
    `tam_1.baslama '09:00'`; `POST .../saat` `{bas: bu gün, baslama:'08:30', bitme:'17:00'}` → GET-də bu günkü
    `08:30`, `saatlar` 2 element; `POST /api/emekdaslar/<ALI>/qrafik {bas, baslama:'10:00', bitme:'15:00'}` → `GET` →
    `indiki.ad 'Fərdi'`, `menbe 'el'`, `tarixce` 1.
  - `'qrafik: yoxlama xətaları 400'`: `baslama > bitme`, `'25:00'`, `bas '2026-02-30'`, mövcud olmayan `sablon_id`,
    mövcud olmayan əməkdaş (404); `X-Aztu` olmadan 403.
  - `'kadr yükləmə: nəticə, təsdiq, tapılmayanların Excel-i'`: ingest ilə 2 əməkdaş; ExcelJS faylı (biri tapılır, biri
    ehtimal, biri yoxdur, `Pin kod` sütunu ilə) → `POST /api/kadr/yukle` (`Content-Type: application/octet-stream`) →
    `tapildi 1`, `ehtimal.length 1`, `yoxdur.length 1`, cavab mətnində Pin dəyəri yoxdur; `POST /api/kadr/tesdiq` ehtimal
    üçün → əməkdaşın qrafiki `stat_05`; `POST /api/kadr/excel` → 200, content-type spreadsheet, ExcelJS ilə oxunanda 1
    məlumat sətri.
  - `'kadr yükləmə: Excel olmayan fayl 400'`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** `src/qrafikApi.js`-i yaz və `apiRouter`-ə qoş.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "İş qrafiki və kadr yükləmə API-si"`

### Task 6: Panel ekranları və sənəd

**Files:**
- Modify: `public/static/app.js`, `public/index.html` (menyuya "Qrafiklər", `data-nav="qrafikler"`), `public/static/`
  CSS faylı (mövcud siniflərdən istifadə, lazım olsa az əlavə), `README.md` (qısa bölmə: "İş qrafiki və kadr siyahısı"),
  `docs/dizayn.md` (yeni cədvəllər)

**Interfaces:**
- Consumes: Task 5 API-si.
- Produces: `#/qrafikler` səhifəsi (`qrafiklerSehife()`), əməkdaş kartında "İş qrafiki" bloku, Əməkdaşlar səhifəsində
  "Kadr siyahısı yüklə" dialoqu (`<dialog>`, mövcud `showModal` üslubu), əməkdaşlar cədvəlində qrafik saatı, hesabat
  günlər cədvəlində "Qrafik" sütunu.

- [ ] **Step 1:** `qrafiklerSehife`: cədvəl (ad, bu günkü saat, əməkdaş sayı, "Saatı dəyiş" → dialoq: tarix + başlama +
  bitmə), tarixçə açılan sətir. `yonlendir`-ə `if (yol === 'qrafikler') return qrafiklerSehife();`.
- [ ] **Step 2:** Əməkdaş kartı: `GET /api/emekdaslar/:id/qrafik` → indiki qrafik, kadr sətirləri (müəssisə, vəzifə,
  tip, ştat, iş vaxtı), "Dəyiş" dialoqu (şablon seçimi və ya "Fərdi" + saatlar, tarix), tarixçə (tarix, qrafik, mənbə,
  kim).
- [ ] **Step 3:** Yükləmə dialoqu: fayl (`accept=".xlsx"`) + tarix → `fetch('/api/kadr/yukle?bas=..', {method:'POST',
  headers:{'X-Aztu':'1','Content-Type':'application/octet-stream'}, body: file})` → nəticə: rəqəm kartları, "Ehtimal" və
  "Çoxmənalı" cədvəlləri (namizəd `<select>` + "Təsdiqlə" → `/api/kadr/tesdiq`), "Sistemdə yoxdur" cədvəli + "Excel
  endir" (`/api/kadr/excel`, mövcud `excelEndir` nümunəsi ilə blob). Bütün mətnlər `esc()` ilə.
- [ ] **Step 4:** Hesabat günlər cədvəlinə və əməkdaşlar cədvəlinə qrafik saatı (`saatQisa`).
- [ ] **Step 5:** README və dizayn.md.
- [ ] **Step 6: Yoxlama** — `npm test` PASS; `node src/server.js` müvəqqəti baza ilə (`BAZA_YOLU` scratchpad-də),
  `npm run istifadeci` ilə sınaq istifadəçisi, brauzerdə: şablon saatını dəyiş, uydurma adlı kiçik Excel yüklə, ehtimalı
  təsdiqlə, kartda qrafik və tarixçə görünür, konsolda xəta yoxdur; telefon enində (375 px) dialoqlar sığır.
- [ ] **Step 7: Commit** — `git commit -m "Panel: iş qrafiki, şablonlar səhifəsi, kadr siyahısı yükləmə"`
