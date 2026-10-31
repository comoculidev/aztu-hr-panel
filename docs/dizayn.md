# AzTU HR paneli — dizayn

## Niyə
Kamera sistemi (192.0.2.77, `Face_recognation` reposu, `server-panel-test` branch-ı) giriş-çıxışda üzləri tanıyır və
hadisələri öz kompüterində CSV-yə yazır. HR-ə əməkdaşların davamiyyətini görmək, axtarmaq və Excel-ə çıxarmaq lazımdır,
amma kamera kompüterinə girməməlidir. Ona görə əməkdaş hadisələri ayrıca serverə (192.0.2.50) ötürülür və orada veb panel
işləyir.

## Hədəflər
- Kamera sistemi olduğu kimi işləyir; server əlçatmaz olsa da tanıma və yerli yazı dayanmır, hadisə itmir.
- Panel: login → 1) ümumi görünüş, 2) əməkdaşlar, 3) hesabat + Excel.
- İş vaxtı qaydası (istifadəçi): günün **ilk girişi** = işə gəliş, günün **son çıxışı** = işdən çıxış, gün içindəki
  çıxış → giriş boşluqları = **işdə olmama vaxtı**.

## Hədəf olmayanlar (v1)
- Turniket, kamera idarəsi, tanıma həddinin paneldən dəyişməsi.
- Tələbə davamiyyəti (tələbə keçidləri yalnız say kimi gəlir, adsız).
- İnternetə açıq panel (yalnız daxili şəbəkə).
- Gecə növbəsi (gün 00:00-da başlayır, Bakı vaxtı).

## Ümumi quruluş
```
Kamera kompüteri 192.0.2.77 (Python)            Server 192.0.2.50 (Node.js)
  tanıma → Qeydiyyat → qeydiyyat.csv (olduğu kimi)
                    └→ HrGonderici ──HTTP POST──→  /api/v1/ingest/*  (Bearer açar + IP icazəsi)
                       (yerli SQLite növbəsi,        │
                        server düşəndə gözləyir)     SQLite (node:sqlite): emekdaslar, hadiseler, ...
  Baza (şəkillər) → əməkdaş siyahısı + şəkil ──→     │
                                                   Express → /api/* (sessiya) → brauzer paneli (HR)
```

## Kamera → server API (v1)
Hamısı JSON, `Authorization: Bearer <HR_API_ACAR>`. Server açarı və mənbə IP-ni (`INGEST_IP=192.0.2.77`) yoxlayır.

### `POST /api/v1/ingest/hadiseler`
```json
{"hadiseler": [
  {"id": "uuid4", "tarix": "2026-10-31", "saat": "09:02:11", "kamera": "T1", "istiqamet": "giris",
   "kateqoriya": "emekdas", "emekdas_id": "ali|veliyev|rasim|dosent|kibertehlukesizlik", "oxsarliq": 0.612},
  {"id": "uuid4", "tarix": "2026-10-31", "saat": "09:02:15", "kamera": "T2", "istiqamet": "giris",
   "kateqoriya": "telebe"},
  {"id": "uuid4", "tarix": "2026-10-31", "saat": "09:03:01", "kamera": "T1", "istiqamet": "giris",
   "kateqoriya": "taninmayan"}
]}
```
- Cavab `{"qebul": n, "tekrar": m}`. `id` təkrardırsa, yazılmır (yenidən göndərmə təhlükəsizdir).
- Ən çox 500 hadisə bir sorğuda.
- **Məxfilik:** tələbə və tanınmayan üçün ad, şəkil, vektor göndərilmir — yalnız say üçün.
- Vaxt kamera kompüterinin yerli vaxtıdır (Asia/Baku, UTC+4); serverdə də eləcə saxlanır.

### `POST /api/v1/ingest/emekdaslar`
Tam siyahı (bazadakı bütün əməkdaşlar; tələbələr yox):
```json
{"emekdaslar": [{"id": "...", "ad": "Əli", "soyad": "Vəliyev", "ata": "Rasim", "sobe": "Kibertəhlükəsizlik",
                 "vezife": "Dosent", "sekil_hash": "sha1"}]}
```
Cavab: `{"yeni": n, "yenilenen": m, "deaktiv": k, "sekil_lazim": ["id", ...]}`. Siyahıda olmayan əməkdaş silinmir,
`aktiv = 0` olur (keçmiş hadisələri qalır).

### `POST /api/v1/ingest/sekiller`
`{"sekiller": [{"id": "...", "jpeg": "<base64>"}]}` — yalnız `sekil_lazim` siyahısındakılar, ≤ 50 bir sorğuda.
Şəkil kamera kompüterində 240 px-ə kiçildilir (bazadakı ilk qəbul olunmuş şəkil).

### `POST /api/v1/ingest/siqnal`
`{"vaxt": "...", "kameralar": [{"ad": "T1", "istiqamet": "giris"}], "novbe": 0, "versiya": "git-hash"}` — hər 60 san.
Panel "Kamera sistemi: onlayn / son siqnal N dəq əvvəl" göstərir.

### Əməkdaş kimdir, ID nədir
- Kateqoriya mövcud qayda ilə (`hesabat.kateqoriya`): `qrup` sahəsində rəqəm və ya "Tələbə/Magistr/..." varsa tələbə,
  qalan sözlər (Dosent, Laborant, ...) — vəzifə, yəni əməkdaş.
- Əməkdaşın **şöbəsi** bazadakı `ixtisas` sütunu, **vəzifəsi** `qrup` sütunudur.
- ID = şəxsin açarı (`Sexs.acar`: ad|soyad|ata|qrup|ixtisas, sadələşdirilmiş). Bazada ad/vəzifə dəyişsə, açar dəyişir və
  serverdə yeni əməkdaş yaranır, köhnəsi deaktiv olur — bu, v1 məhdudiyyətidir (tabel nömrəsi gələndə ID ona keçəcək).

## Kamera tərəfi (Python, `server-panel-test`)
- `aztu_uz/hr_server.py`:
  - `HrGonderici` — hadisəni payload-a çevirir, **yerli SQLite növbəsinə** (`<cixis>/hr_novbe.db`) yazır, arxa axın
    partiya ilə göndərir; xəta olanda 5 san → 5 dəq artan gözləmə; proqram dayananda növbə diskdə qalır.
  - əməkdaş siyahısı: xidmət başlayanda və baza yenilənəndə (F5 / avtomatik) arxa axında göndərilir.
  - siqnal hər 60 san.
  - yalnız standart kitabxana (`urllib`, `sqlite3`) — yeni asılılıq yoxdur.
- `Qeydiyyat`: hadisə sətri **son qərardan sonra** (geri alınan "tanınmadı"lar artıq atılıb) göndəriciyə verilir.
- `konfiq.toml`:
  ```toml
  [hr_server]
  url = "http://192.0.2.50:3000"
  acar = "${HR_API_ACAR}"      # açar konfiqdə açıq yazılmır — mühit faylında
  ```
  Bölmə yoxdursa, sistem əvvəlki kimi işləyir (heç nə göndərilmir).

## Server (Node.js ≥ 22.13, bu repo)
- Express 5 + `node:sqlite` (daxili, yerli kompilyasiya lazım deyil) + `exceljs`.
- Cədvəllər: `emekdaslar`, `hadiseler` (indekslər: `tarix`, `(emekdas_id, tarix, saat)`), `istifadeciler`,
  `sessiyalar`, `sistem`.
- Giriş: istifadəçi adı + parol (scrypt), sessiya kukisi (HttpOnly, SameSite=Strict, 8 saat), 5 səhv cəhddən sonra
  15 dəqiqə blok. İstifadəçilər `npm run istifadeci` ilə yaradılır (paneldə qeydiyyat yoxdur). Rollar: `admin`, `hr`.
- Panel API-si yalnız sessiya ilə; kamera API-si yalnız Bearer açar + IP ilə.

## Panel
1. **Ümumi görünüş** — müddət filtri (bu gün, dünən, son 7 gün, bu ay, seçilmiş aralıq):
   ümumi keçid, əməkdaş keçidi, işə gələn əməkdaş (unikal), tələbə keçidi, tanınmayan; günlük/saatlıq qrafik;
   altda son hadisələr (10 san-da bir yenilənir, kamera və növ filtri); kamera sisteminin siqnal vəziyyəti.
2. **Əməkdaşlar** — axtarış (ad, soyad, ata adı, şöbə, vəzifə; "Eli" = "Əli" = "Ali"), şöbə və vəzifə filtri, siyahı.
   Klik → kart: şəkil, məlumat, **bu gün**: gəliş, çıxış, işdə olmama, işdə olma, hazırda binadadır/çıxıb, günün
   hadisələri (zaman xətti); **tarixçə**: seçilən aralıqda gün-gün gəliş/çıxış/olmama.
3. **Hesabat** — müddət (gün, ay, son 7 gün, aralıq), şöbə, vəzifə, əməkdaş; cədvəl: əməkdaş × gün; əməkdaş seçiləndə
   onun cədvəli; **Excel-ə çıxar** — ekranda nə seçilibsə, o: "Gündəlik" + "Xülasə" (əməkdaş üzrə cəmlər) vərəqləri.

## İş vaxtı hesabı (bir əməkdaş, bir gün)
1. Hadisələr vaxta görə sıralanır; eyni istiqamətdə 60 san ərzində təkrar (bir neçə kamera) — bir hadisə.
2. **Gəliş** = günün ilk girişi. Giriş yoxdursa — ilk hadisə, qeyd: "giriş qeydə alınmayıb".
3. Gəlişdən sonra: içəridə → çıxış: çıxdı (vaxt yadda); çöldə → giriş: boşluq = giriş − çıxış (işdə olmama).
   Çöldə ikinci çıxış (arada giriş görünməyib) — boşluq hesablanmır, qeyd: "giriş qeydə alınmayıb".
   İçəridə ikinci giriş — sayılmır.
4. **Çıxış** = gəlişdən sonrakı son çıxış. Yoxdursa — "çıxış qeydə alınmayıb", son görünmə göstərilir; bu gündürsə
   "binadadır".
5. **İşdə olma** = (çıxış − gəliş) − işdə olmama. Son çıxışdan sonrakı vaxt (evə gediş) boşluq deyil.
6. Əlavə (iş qrafiki, `.env`: `IS_BASLAMA=09:00`, `IS_BITME=18:00`): gecikmə = gəliş − başlama, erkən çıxış =
   bitmə − çıxış (müsbətdirsə). Hesabatda sütun kimi.

## Mənim qərarlarım (istifadəçi sual vermədən başlamağı seçdi)
- API (REST/JSON) + yerli növbə; serverdə SQLite (30 kamera üçün kifayətdir, sonra PostgreSQL-ə keçid asandır).
- Tələbə və tanınmayan keçidləri adsız göndərilir — HR-ə ad lazım deyil, məxfilik.
- Əməkdaş ID-si = bazadakı açar (tabel nömrəsi bazada yoxdur).
- İş qrafiki 09:00–18:00 (dəyişdirilə bilər), gün sərhədi 00:00.
- HTTP daxili şəbəkədə; açar + IP icazəsi. HTTPS (nginx və ya öz sertifikat) yerləşdirmədə tövsiyə olunur.
- Repo: `comoculidev/aztu-hr-panel`, **private**.

## Yoxlama
- Python: göndərici (yalançı HTTP serverlə), növbə, konfiq, Qeydiyyat bağlantısı — `unittest`.
- Node: iş vaxtı hesabı, axtarış, API (müvəqqəti baza ilə), Excel — `node --test`.
- Uçdan-uca: yerli Node server + Python göndərici real hadisələrlə; brauzerdə panel.
