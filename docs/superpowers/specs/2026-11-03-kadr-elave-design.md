# Kadr əlavə etmə, telefondan şəkil, redaktə və silmə — dizayn

Tarix: 03.11.2026 · Branch: `kadr-elave`

## Məqsəd

HR paneldən əl ilə yeni kadr əlavə edə bilsin. Hər kadr üçün ona özəl, müddətli bir link (URL + QR) yaransın. Telefonla QR
skan ediləndə kamera açılsın, çəkilən şəkil "Kadrı əlavə et" ilə kadrın şəkli olsun. Bütün əməkdaşlar (kameradan
gələnlər də) redaktə və silinə bilsin. Şəkil **üz tanıma sisteminə getmir** — yalnız paneldə görünür.

## Qərarlar (istifadəçi ilə razılaşdırılıb)

- Kameradan gələn əməkdaşda **HR düzəlişi üstündür**: HR-in dəyişdiyi ad/şöbə/vəzifəni kamera sinxronu yazmır; silinən
  əməkdaş kamera siyahısında olsa da geri qayıtmır. Keçmiş hadisələr hesabatda qalır (heç nə fiziki silinmir).
- Şəkil linki **24 saat, bir dəfəlik**; yenisi yarananda köhnəsi bağlanır.
- QR üçün yeni asılılıq: **`qrcode`** (npm, MIT) — serverdə SVG yaradılır, internet lazım deyil.
- Yanaşma A: mövcud `emekdaslar` cədvəlinə sahələr əlavə olunur (ayrı cədvəl + hər sorğuda birləşmə yox) — beləcə əl ilə
  əlavə olunan kadr hesabat, qrafik, kadr Excel uyğunlaşdırması və axtarışda dəyişiklik olmadan görünür.

## Məlumat modeli

`emekdaslar`-a (`sutunElave` ilə, köhnə bazalar avtomatik yenilənir):

| sahə | tip | məna |
|---|---|---|
| `menbe` | TEXT DEFAULT 'kamera' | `kamera` — sinxrondan; `el` — paneldən əlavə |
| `hr_duzelib` | INTEGER DEFAULT 0 | 1: ad, soyad, ata, şöbə, vəzifə HR-indir, sinxron onları yazmır |
| `silinib` | INTEGER DEFAULT 0 | 1: HR silib (`aktiv = 0`), sinxron aktivləşdirmir |
| `hr_sekil` | BLOB | HR-in (telefon/kompüter) şəkli; varsa kameranın `sekil`-indən üstündür |
| `hr_sekil_vaxt` | TEXT | şəklin alındığı vaxt |

Yeni cədvəl:

```sql
CREATE TABLE IF NOT EXISTS sekil_linkleri (
  token_hash TEXT PRIMARY KEY,          -- sha256(token); token özü saxlanmır
  emekdas_id TEXT NOT NULL REFERENCES emekdaslar(id),
  kim TEXT NOT NULL, yaradilib TEXT NOT NULL,
  bitir INTEGER NOT NULL,               -- ms; yaradilib + 24 saat
  istifade TEXT                         -- şəkil alınan vaxt; doludursa link bağlıdır
);
```

Əl ilə kadrın id-si: `el-` + 12 təsadüfi hex (kamera açarları ilə toqquşmur).

## Kamera sinxronu (`src/ingest.js`) dəyişiklikləri

- Upsert: `hr_duzelib = 1` olanda ad/soyad/ata/şöbə/vəzifə/axtaris köhnə qalır; `silinib = 1` olanda `aktiv` 0 qalır.
- Deaktivləşdirmə yalnız `menbe = 'kamera'` olanlara: əl ilə kadr kamera siyahısında olmadığı üçün söndürülmür.
- `/sekiller` kameranın `sekil`-ini yazmağa davam edir; `hr_sekil` ona toxunulmur. Göstərmədə `COALESCE(hr_sekil, sekil)`.

## API (panel, sessiya + `X-Aztu`)

- `POST /api/emekdaslar` `{ad, soyad, ata?, sobe?, vezife?, sablon_id?}` → 201 `{id}`. Ad və soyad məcburi (1–100 simvol),
  digərləri ≤200. `sablon_id` verilibsə bu gündən qrafik təyin olunur (`menbe 'el'`), yoxsa standart.
- `PUT /api/emekdaslar/:id` eyni sahələr → `hr_duzelib = 1`, `axtaris` yenidən qurulur. 404 tanınmayan/silinmiş.
- `DELETE /api/emekdaslar/:id` → `silinib = 1, aktiv = 0`, açıq linklər bağlanır. 404 tanınmayan.
- `POST /api/emekdaslar/:id/sekil-link` → `{url, qr, bitir}`; `qr` — SVG-nin `data:image/svg+xml;base64,...` forması
  (CSP `img-src data:` icazə verir). Köhnə açıq link bağlanır.
- `GET /api/emekdaslar/:id/sekil-link` → `{acıq: bool, bitir, istifade}` — panel pəncərəsi 3 saniyədən bir soruşur və şəkil
  gələndə önizləməni göstərir.
- `POST /api/emekdaslar/:id/sekil` (gövdə: JPEG, ≤5 MB) — kompüterdən yükləmə.
- `GET /api/emekdaslar/:id/sekil` → `COALESCE(hr_sekil, sekil)`.
- Siyahı/kart cavablarına `menbe`, `hr_duzelib` əlavə olunur.

URL bazası: `.env`-də `PANEL_URL` varsa o, yoxsa sorğunun özü (`req.protocol + host`) — HR paneli hansı ünvanla açıbsa.

## Telefon tərəfi (girişsiz)

- `GET /sekil/:token` → `public/sekil.html` (statik; token yalnız URL-dədir).
- `GET /api/v1/sekil/:token` → `{ad, soyad}` və ya 410 `{xeta: 'Link vaxtı keçib və ya istifadə olunub'}`; 404 tanınmayan.
- `POST /api/v1/sekil/:token` (gövdə: JPEG, ≤5 MB) → şəkil `hr_sekil`-ə yazılır, link `istifade` olur (eyni əməliyyatda).
  Yalnız JPEG (`FF D8 FF` imzası) qəbul olunur; boş, böyük və ya başqa format → 400/413.
- Səhifə (`public/static/sekil.js`): kadrın adı; "Şəkil çək" (`<input type=file accept=image/* capture=user>` — HTTPS
  tələb etmir); önizləmə, "Yenidən çək"; **"Kadrı əlavə et"** — brauzerdə canvas ilə ən çox 1024 px, JPEG 0.85-ə
  kiçildilib göndərilir; nəticə: "Şəkil qəbul olundu" və ya aydın xəta. Panelin tema/rəngləri ilə uyğun, telefon eni üçün.
- Bu marşrutlar `/api/v1/sekil` altında sessiyasız işləyir; token 32 bayt təsadüfi (base64url), müqayisə heş ilə.
  Cavablarda yalnız kadrın adı və soyadı verilir.

## Panel (UI)

- **Əməkdaşlar** səhifəsi: "Kadr əlavə et" düyməsi; siyahıda əl ilə kadrlara "Paneldən" nişanı.
- **Kadr əlavə et** pəncərəsi (mövcud `pencere()` üslubu): ad, soyad, ata adı, şöbə, vəzifə, iş qrafiki şablonu
  (standart: "Tam, 1 ştat"). Yadda saxla → 2-ci addım: QR + link (kopyala düyməsi) + "24 saat etibarlıdır" + "Şəkil
  gözlənilir…"; şəkil gələndə önizləmə və "Hazırdır". Alternativ: "Kompüterdən yüklə".
- **Kart**: şəkil (`hr_sekil` üstün); düymələr "Redaktə et", "Şəkil linki", "Sil" (təsdiq: "Keçmiş hadisələr hesabatda
  qalır"). Kameradan gələn redaktə olunubsa "HR düzəlişi" nişanı. Silinəndən sonra Əməkdaşlar siyahısına qayıdır.
- Mətnlər Azərbaycanca, 375 px enində üfüqi sürüşmə yox, işıqlı/qaranlıq tema mövcud tokenlərlə.

## Xətalar

`{xeta}` formatı qalır: 400 yoxlama, 404 tapılmadı, 410 link bağlı, 413 böyük fayl. Jurnal: kim, kimi əlavə/redaktə/sildi,
link yaradıldı/istifadə olundu (token jurnala yazılmır).

## Testlər

- DB: yeni sahələr köhnə bazaya əlavə olunur.
- Sinxron: `hr_duzelib` adı qoruyur; `silinib` aktivləşmir; `menbe 'el'` deaktiv olmur; yeni kamera əməkdaşı əvvəlki kimi.
- API: əlavə (201, məcburi sahələr, qrafik təyini), redaktə (`hr_duzelib`, axtarışda yeni ad), silmə (siyahıda yox,
  hesabatda keçmiş hadisə qalır), CSRF/sessiya tələbi.
- Link: yaradılır, QR data URI-dir; GET ad qaytarır; POST şəkli yazır və link bağlanır; təkrar POST 410; müddəti keçmiş
  410; yeni link köhnəni bağlayır; JPEG olmayan 400; >5 MB 413; silinmiş kadrın linki 410.
- Brauzer: əlavə → QR → telefon səhifəsində şəkil → panelə düşür; redaktə; silmə; 375 px.

## Əhatədən kənar

- Şəklin üz tanıma bazasına (kamera kompüterinə) göndərilməsi — sonrakı mərhələ.
- Silinmiş kadrı bərpa etmə ekranı, HR düzəlişini geri alma.
- Telefonun panelə internet üzərindən çatması (panel yalnız daxili şəbəkədədir).
