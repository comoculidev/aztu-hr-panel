# Kadr əlavə etmə, telefondan şəkil, redaktə və silmə — icra planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR paneldən kadr əlavə etmək, hər kadra 24 saatlıq bir dəfəlik link/QR ilə telefondan şəkil almaq, bütün əməkdaşları redaktə və silmək.

**Architecture:** `emekdaslar` cədvəlinə `menbe`, `hr_duzelib`, `silinib`, `hr_sekil`, `hr_sekil_vaxt` sahələri və `sekil_linkleri` cədvəli əlavə olunur; kamera sinxronu bu sahələrə hörmət edir. Məntiq `src/emekdasIdare.js`-də, panel marşrutları `src/emekdasApi.js`-də (sessiya + `X-Aztu`), girişsiz telefon marşrutları `src/sekilApi.js`-də (`/api/v1/sekil`). Telefon səhifəsi statik `public/sekil.html` + `public/static/sekil.js`; panel ekranları `public/static/app.js`-də yeni bölmə.

**Tech Stack:** Node ≥22.13, Express 5, `node:sqlite`, `node:test`, vanilla JS; yeni asılılıq `qrcode@1.5.4` (istifadəçi təsdiqləyib).

**Spec:** `docs/superpowers/specs/2026-11-03-kadr-elave-design.md`

## Global Constraints

- Xəta formatı `{xeta}`; GET-dən başqa panel sorğuları `X-Aztu: 1` başlığı tələb edir (mövcud middleware).
- Kodda Azərbaycanca ASCII adlar, şərhlər Azərbaycanca, "niyə" izah olunur.
- Testlərdə yalnız uydurma adlar və 192.0.2.x ünvanları; real kadr Excel-i və şəxsi məlumat git-ə düşmür.
- Token: 32 bayt `randomBytes` → base64url; bazada yalnız `sha256` heşi; token jurnala yazılmır.
- Link: 24 saat (`LINK_MS = 86_400_000`), bir dəfəlik; yenisi köhnəni bağlayır; silinən kadrın linkləri bağlanır.
- Şəkil: yalnız JPEG (`FF D8 FF`), ən çox 5 MB; telefonda canvas ilə ≤1024 px, keyfiyyət 0.85.
- Şəkil kamera/üz tanıma sisteminə göndərilmir. Heç nə fiziki silinmir (keçmiş hadisələr qalır).
- Sahələr: ad, soyad məcburi (trim, 1–100); ata ≤100; şöbə, vəzifə ≤200; sətir olmayan dəyər boş sayılır.
- Əl ilə kadrın id-si `el-` + 12 hex (`randomBytes(6)`).
- Fayllar CRLF ola bilər (`core.autocrlf=true`): skriptlə dəyişməzdən əvvəl `sed -i 's/\r$//'`, commit-də yalnız məzmun dəyişən fayllar.

## Review Focus

1. Telefonda iki dəfə "Kadrı əlavə et" basılır (və ya şəbəkə təkrar göndərir) — ikinci sorğu 410 almalı, birinci şəkil qalmalı; `istifade` yazılışı şərtli `UPDATE … WHERE istifade IS NULL AND bitir > ?` ilə atomik olmalıdır (Task 2 testi).
2. Telefon HEIC/PNG və ya çox böyük şəkil göndərir — brauzer canvas ilə JPEG-ə çevirir; server JPEG olmayanı aydın 400, >5 MB-ı 413 ilə rədd edir (Task 4 testi).
3. HR paneli `localhost`/`127.0.0.1` ilə açıb və `PANEL_URL` yoxdur — QR telefonda açılmaz; pəncərə xəbərdarlıq göstərməlidir (Task 3 cavabında `yerli: true`, Task 5 UI).
4. Kamera sinxronu silinmiş və ya HR-in redaktə etdiyi əməkdaşı yenidən göndərir — ad və `aktiv=0` qorunmalı; əl ilə kadr siyahıda olmadığı üçün deaktiv olmamalı (Task 1 testi).
5. Silinmiş kadrın açıq linki və silinmiş kadrı redaktə — 410 / 404 (Task 2 və 3 testləri).

---

### Task 1: Sxem və kamera sinxronunun qorunması

**Files:**
- Modify: `src/db.js` (SXEM + `bazaAc` içində `sutunElave`)
- Modify: `src/ingest.js:80-120` (`POST /emekdaslar`)
- Modify: `src/hesabat.js:31-45` (`emekdasSec`)
- Modify: `src/api.js:225-229` (`GET /emekdaslar/:id/sekil`)
- Test: `test/api.test.js`

**Interfaces:**
- Produces: sütunlar `emekdaslar.menbe TEXT NOT NULL DEFAULT 'kamera'`, `hr_duzelib INTEGER NOT NULL DEFAULT 0`, `silinib INTEGER NOT NULL DEFAULT 0`, `hr_sekil BLOB`, `hr_sekil_vaxt TEXT`; cədvəl `sekil_linkleri(token_hash TEXT PK, emekdas_id TEXT NOT NULL REFERENCES emekdaslar(id), kim TEXT NOT NULL, yaradilib TEXT NOT NULL, bitir INTEGER NOT NULL, istifade TEXT)`; `emekdasSec` sətirlərində əlavə `menbe`, `hr_duzelib`, `sekil_var = (hr_sekil IS NOT NULL OR sekil IS NOT NULL)`.

- [ ] **Step 1: Failing test** — `test/api.test.js`-ə `test('sinxron: HR düzəlişi, silinmə və əl ilə kadr qorunur', …)`:
  bazaya birbaşa yaz: kamera əməkdaşı `k1` (`hr_duzelib=1`, ad `Nərmin`), `k2` (`silinib=1, aktiv=0`), əl ilə `el-000000000001` (`menbe='el'`). `ingest('emekdaslar', {emekdaslar: [{id:'k1', ad:'Nermin2', soyad:'Q'}, {id:'k2', ad:'X', soyad:'Y'}, {id:'k3', ad:'Yeni', soyad:'Z'}]})` sonra:
  `k1.ad === 'Nərmin'`, `k2.aktiv === 0`, `el-…aktiv === 1`, `k3.aktiv === 1 && k3.menbe === 'kamera'`. Sonda bu id-ləri sil.
  Həmçinin: `hr_sekil` yazılmış əməkdaşın `GET /api/emekdaslar/:id/sekil` cavabı `hr_sekil` baytlarıdır; `GET /api/emekdaslar` sətirində `menbe` var.
- [ ] **Step 2:** `node --test test/api.test.js` — Expected: FAIL (`no such column: hr_duzelib`).
- [ ] **Step 3:** Sxem: `sekil_linkleri` SXEM-ə; beş sütun `sutunElave` ilə. Ingest upsert: `ad = CASE WHEN emekdaslar.hr_duzelib = 1 THEN emekdaslar.ad ELSE excluded.ad END` (soyad, ata, sobe, vezife, axtaris eyni), `aktiv = CASE WHEN emekdaslar.silinib = 1 THEN 0 ELSE 1 END`; `movcud` sorğusu `menbe` də oxuyur, deaktivləşdirmə yalnız `menbe = 'kamera'`. `emekdasSec` SELECT-ə sahələr. Şəkil GET: `SELECT COALESCE(hr_sekil, sekil) AS sekil`.
- [ ] **Step 4:** `npm test` — Expected: hamısı PASS.
- [ ] **Step 5: Commit** `src/db.js src/ingest.js src/hesabat.js src/api.js test/api.test.js` — "Əməkdaş: menbe, HR düzəlişi, silinmə; sinxron onları qoruyur".

### Task 2: İdarə məntiqi (`src/emekdasIdare.js`)

**Files:**
- Create: `src/emekdasIdare.js`
- Test: `test/emekdasIdare.test.js`

**Interfaces:**
- Consumes: Task 1 sxemi; `formalar` (`src/axtaris.js`), `emeliyyat`, `indiYaz` (`src/db.js`), `SorguXetasi` (`src/hesabat.js`).
- Produces:
  - `LINK_MS = 86_400_000`
  - `jpegdir(buf: Buffer) → boolean`
  - `sahelerOxu(govde) → {ad, soyad, ata, sobe, vezife}` (SorguXetasi: "Ad və soyad məcburidir")
  - `emekdasElave(db, govde) → string` (id `el-…`, `menbe 'el'`)
  - `emekdasDeyis(db, id, govde) → boolean` (false: yoxdur və ya silinib; `hr_duzelib = 1`, `axtaris` yenilənir)
  - `emekdasSil(db, id) → boolean` (`silinib=1, aktiv=0`; açıq linklər `bitir = 0`)
  - `sekilYaz(db, id, buf) → boolean`
  - `linkYarat(db, id, kim, indi = Date.now()) → {token, bitir} | null` (silinmiş/yox → null; əvvəlki açıqlar bağlanır)
  - `linkVeziyyeti(db, id, indi = Date.now()) → {aciq: boolean, bitir: number|null, istifade: string|null}` (ən son link)
  - `linkTap(db, token, indi = Date.now()) → {veziyyet: 'yox'|'bagli'|'aciq', emekdas?: {id, ad, soyad}}`
  - `linkleSekilYaz(db, token, buf, indi = Date.now()) → 'yazildi'|'bagli'|'yox'`

- [ ] **Step 1: Failing tests** (`bazaAc(':memory:')`):
  - `sahelerOxu`: `{ad:' Əli ', soyad:'Vəliyev'}` → `ad === 'Əli'`; ad boş → SorguXetasi; 101 simvollu ad → SorguXetasi; `sobe: 5` → `''`.
  - `emekdasElave` → id `/^el-[0-9a-f]{12}$/`, sətir `menbe='el', aktiv=1`, `emekdasSec(db,{q:'veliyev'})` onu tapır.
  - `emekdasDeyis` → `hr_duzelib=1`, yeni ad axtarışda; silinmişdə `false`.
  - `emekdasSil` → `aktiv=0, silinib=1`; açıq link `linkTap` → `'bagli'`.
  - `linkYarat` → token 43 simvol base64url; bazada token yox, heşi var; ikinci `linkYarat` birincini bağlayır.
  - `linkTap`: tanınmayan → `'yox'`; `indi = bitir + 1` → `'bagli'`; açıq → `{veziyyet:'aciq', emekdas:{id, ad, soyad}}`.
  - `linkleSekilYaz`: JPEG ilə `'yazildi'`, `hr_sekil` yazılıb, `linkVeziyyeti.aciq === false`; ikinci çağırış `'bagli'` və birinci şəkil dəyişmir.
  - `jpegdir`: `FF D8 FF E0…` true, PNG imzası false, boş false.
- [ ] **Step 2:** `node --test test/emekdasIdare.test.js` — Expected: FAIL (modul yoxdur).
- [ ] **Step 3:** Yaz. `linkleSekilYaz` `emeliyyat` içində: `UPDATE sekil_linkleri SET istifade = ? WHERE token_hash = ? AND istifade IS NULL AND bitir > ? AND emekdas_id IN (SELECT id FROM emekdaslar WHERE silinib = 0)` — `changes === 1` olanda şəkli yaz; yoxdursa sətrin varlığına görə `'bagli'`/`'yox'`.
- [ ] **Step 4:** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — "Kadr idarəsi: əlavə, redaktə, silmə, şəkil linki".

### Task 3: Panel API-si və QR

**Files:**
- Create: `src/emekdasApi.js`
- Modify: `src/api.js` (router qoşulur), `src/konfiq.js` (`panelUrl`), `.env.example`, `package.json`/`package-lock.json` (`npm install qrcode@1.5.4`)
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: Task 2 funksiyaları; `qrafikYaz` (`src/qrafik.js`) şablon təyini üçün.
- Produces: `emekdasRouter(db, k, log) → express.Router`, `apiRouter`-də `qrafikRouter`-dən əvvəl `r.use(...)`. Marşrutlar:
  - `POST /emekdaslar` → 201 `{id}`; `sablon_id` varsa `qrafikYaz(db, {emekdasId, bas: buGun(), sablonId, menbe: 'el', kim})`, tanınmayan şablon 400.
  - `PUT /emekdaslar/:id` → 200 `{ok: true}` | 404
  - `DELETE /emekdaslar/:id` → 200 `{ok: true}` | 404
  - `POST /emekdaslar/:id/sekil-link` → 200 `{url, qr, bitir, yerli}`; `url = (k.panelUrl || req.protocol + '://' + req.get('host')) + '/sekil/' + token`; `qr = 'data:image/svg+xml;base64,' + base64(await QRCode.toString(url, {type: 'svg', margin: 1}))`; `yerli = /^(localhost|127\.|\[::1\])/.test(host)`; 404 yox/silinmiş.
  - `GET /emekdaslar/:id/sekil-link` → `linkVeziyyeti`
  - `POST /emekdaslar/:id/sekil` (`express.raw({type: ['image/jpeg', 'application/octet-stream'], limit: '5mb'})`) → 200 | 400 "Şəkil JPEG olmalıdır" | 404 | 413
- `k.panelUrl`: `env.PANEL_URL` sonundakı `/` atılmış, yoxsa `''`.

- [ ] **Step 1: Failing tests** `test('kadr idarəsi API: əlavə, redaktə, silmə, link, şəkil', …)`:
  - `yaz('/api/emekdaslar', {ad:'Tural', soyad:'Nəbiyev', vezife:'Laborant', sablon_id: <stat_05 id>}, kuki)` → 201; `GET /api/emekdaslar/:id/qrafik` `indiki.ad === 'Tam, 0,5 ştat'`; ad yoxdursa 400; `X-Aztu` olmadan 403; kukisiz 401.
  - `PUT` `{ad: 'Tural', soyad: 'Nəbiyev2'}` → 200, `GET /api/emekdaslar?q=nebiyev2` onu tapır və `hr_duzelib === 1`; tanınmayan id 404.
  - `POST …/sekil-link` → `url` `/sekil/` ilə bitən 43 simvol; `qr` `data:image/svg+xml;base64,` ilə başlayır; `yerli === true` (test 127.0.0.1-dədir).
  - `POST …/sekil` JPEG baytları → 200, `GET …/sekil` eyni baytlar; PNG imzası → 400; 6 MB → 413.
  - `DELETE` → 200; `GET /api/emekdaslar` siyahısında yoxdur; `GET /api/emekdaslar/:id` 200 və `aktiv === 0`; təkrar `PUT` 404; `sekil-link` 404.
- [ ] **Step 2:** `node --test test/api.test.js` — Expected: FAIL (404 marşrut yox).
- [ ] **Step 3:** `npm install qrcode@1.5.4`; router, konfiq, `.env.example`-də `# PANEL_URL=http://192.0.2.50:3000 (telefon linki üçün; boşdursa paneli açan ünvan)`. Jurnal: `kadr: <kim> — əlavə/redaktə/sildi <ad soyad>`, `şəkil linki yaradıldı` (token yox).
- [ ] **Step 4:** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — "Panel API-si: kadr əlavə/redaktə/silmə, şəkil linki (QR), şəkil yükləmə".

### Task 4: Girişsiz telefon səhifəsi

**Files:**
- Create: `src/sekilApi.js`, `public/sekil.html`, `public/static/sekil.js`
- Modify: `src/app.js` (`/api/v1/sekil` router `/api`-dən əvvəl; `GET /sekil/:token` → `sekil.html`, `Cache-Control: no-store`), `public/static/style.css` (telefon səhifəsi üslubları)
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `linkTap`, `linkleSekilYaz`, `jpegdir` (Task 2).
- Produces: `sekilRouter(db, log)`: `GET /:token` → 200 `{ad, soyad}` | 404 `{xeta:'Link tapılmadı'}` | 410 `{xeta:'Link vaxtı keçib və ya istifadə olunub'}`; `POST /:token` yalnız `Content-Type: image/jpeg` (`express.raw`, 5mb) → 200 `{ok:true}` | 400 | 404 | 410 | 413 (öz xəta emalçısı ilə `{xeta}`).

- [ ] **Step 1: Failing tests** `test('telefon şəkil linki: girişsiz, bir dəfəlik', …)`: panel API ilə kadr + link yarat; `GET /sekil/<token>` 200 HTML; `GET /api/v1/sekil/<token>` (kukisiz) → `{ad, soyad}`, cavabda başqa sahə yoxdur; `POST` JPEG (`image/jpeg`) → 200, panelin `GET …/sekil-link` `aciq === false` və `istifade` dolu; təkrar `POST` 410; `GET` 410; yeni link + PNG → 400; `Content-Type: text/plain` → 400 və ya 415 (biri — `[400, 415].includes`); 6 MB → 413; tanınmayan token 404; kadr silinəndən sonra yeni linkin `GET`-i 410.
- [ ] **Step 2:** `node --test test/api.test.js` — Expected: FAIL.
- [ ] **Step 3:** Router və səhifə. `sekil.html` `giris.html`-in quruluşunu təkrarlayır (eyni `tema.js`, `style.css`); `sekil.js`: `GET` ilə ad, "Şəkil çək" (`<input type=file accept="image/*" capture="user">`), önizləmə, "Yenidən çək", "Kadrı əlavə et" (canvas ≤1024 px, `toBlob('image/jpeg', 0.85)`, `fetch` POST, düymə gözləmə vəziyyətində), nəticə mesajları (qəbul olundu / link bağlıdır / xəta). CSP dəyişmir (`blob:` lazımdırsa önizləmə `URL.createObjectURL` əvəzinə `FileReader` data URI ilə — `img-src data:` icazəlidir).
- [ ] **Step 4:** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — "Telefon şəkil səhifəsi: girişsiz, bir dəfəlik link".

### Task 5: Panel ekranları və sənədlər

**Files:**
- Modify: `public/static/app.js` (yeni bölmə "6. KADR İDARƏSİ"; `emekdaslarSehife`, `emekdasSehife`), `public/static/style.css`, `README.md`, `docs/dizayn.md`

**Interfaces:**
- Consumes: Task 3 marşrutları; mövcud `pencere()`, `gozleIsle()`, `postJson()`, `api()`, `esc()`, `sekilUrl()`, `kartUrl()`.
- Produces (app.js): `kadrFormaPencere(e = null)` (əlavə/redaktə; şablon seçimi yalnız əlavədə, `/api/qrafik/sablonlar`-dan), `sekilLinkPencere(id, adSoyad)` (QR `<img>`, link + "Kopyala", "24 saat etibarlıdır", `yerli` olanda xəbərdarlıq "Telefon bu ünvanı aça bilməz — paneli şəbəkə ünvanı ilə açın və ya PANEL_URL təyin edin", 3 san-dən bir `GET …/sekil-link`, şəkil gələndə önizləmə + "Hazırdır"; pəncərə bağlananda interval dayanır; "Kompüterdən yüklə" — canvas ilə JPEG), `kadrSilPencere(e)` (təsdiq mətni "Keçmiş hadisələr hesabatda qalır").
  - Əməkdaşlar: başlıqda "Kadr əlavə et" düyməsi (`#e-elave`); `menbe === 'el'` sətirdə `<span class="nisan">Paneldən</span>`.
  - Kart: "Redaktə et", "Şəkil linki", "Sil" düymələri; `hr_duzelib` olanda "HR düzəlişi" nişanı; silinmiş (`aktiv === 0`) kartda düymələr gizlidir.

- [ ] **Step 1:** UI-ni yaz; `node --check public/static/app.js public/static/sekil.js` — Expected: xəta yoxdur.
- [ ] **Step 2: Brauzer yoxlaması** (`.claude/launch.json` "hr-sinaq", uydurma baza): kadr əlavə → QR və link görünür → linki ayrı tabda aç, `DataTransfer` ilə uydurma JPEG seç, "Kadrı əlavə et" → panel pəncərəsində önizləmə ≤3 san; kartda şəkil; redaktə → ad dəyişir, siyahıda görünür; sil → siyahıdan çıxır; köhnə link 410 mesajı; 375 px-də hər iki səhifədə üfüqi sürüşmə yoxdur; konsolda xəta yoxdur.
- [ ] **Step 3:** README (Kadr əlavə et, şəkil linki, `PANEL_URL`), `docs/dizayn.md` (yeni sahələr, sinxron qaydası).
- [ ] **Step 4:** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — "Panel: kadr əlavə et, QR şəkil linki, redaktə və silmə".
