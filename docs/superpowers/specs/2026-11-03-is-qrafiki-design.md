# Əməkdaşların iş qrafiki — dizayn

Tarix: 03.11.2026. Branch: `is-qrafiki`.

## Məqsəd

İndi bütün əməkdaşlar üçün iş vaxtı eynidir: `.env`-dəki `IS_BASLAMA`/`IS_BITME` (09:00–18:00), iş günləri B.e.–Cümə.
Universitetdə isə iş vaxtı ştatdan və iş rejimindən asılıdır (0,5 ştat, qısaldılmış iş günü və s.), ona görə gecikmə və
erkən çıxış hamı üçün səhv hesablanır. Məqsəd: hər əməkdaşın öz iş qrafiki olsun, ilkin qrafik kadr Excel-indən
(şablonla) avtomatik təyin olunsun, HR istənilən əməkdaşın qrafikini paneldən dəyişə bilsin, dəyişiklik tarixlə qüvvəyə
minsin (keçmiş hesabatlar dəyişməsin).

Uğur meyarı: kadr Excel-i yükləndikdən sonra hesabatda hər əməkdaşın gecikmə/erkən çıxışı onun öz qrafikinə görə
hesablanır; HR əl ilə qrafik dəyişəndə dəyişiklikdən əvvəlki günlərin rəqəmləri eyni qalır.

## Qərarlar (istifadəçi ilə razılaşdırılıb)

- Qrafik həftənin bütün iş günləri üçün eynidir: bir başlama və bir bitmə saatı. İş günləri dəyişmir (B.e.–Cümə).
- Şablonlar + fərdi dəyişiklik. Başlanğıc şablonlar (saatlara nahar fasiləsi daxildir):

  | Açar          | Ad                 | Saat        |
  |---------------|--------------------|-------------|
  | `tam_1`       | Tam, 1 ştat        | 09:00–17:30 |
  | `stat_075`    | Tam, 0,75 ştat     | 09:00–16:00 |
  | `stat_05`     | Tam, 0,5 ştat      | 09:00–13:00 |
  | `stat_025`    | Tam, 0,25 ştat     | 09:00–11:00 |
  | `qisaldilmis` | Qısaldılmış        | 09:00–16:30 |
  | `natamam`     | Natamam            | 09:00–13:00 |

- Excel HR paneldən yüklənir (bir dəfəlik skript yox).
- Dəyişikliklər tarixlə qüvvəyə minir: həm əməkdaşın təyinatı, həm şablonun saatı.
- İki vəzifəli əməkdaş (Əsas + əvəzçi): qrafik Əsas sətirdən; əvəzçilik yalnız məlumat kimi göstərilir.
- Şəxsi məlumat: Excel-dəki **Pin kod (FİN), Təvəllüdü, Cinsi heç oxunmur və heç yerdə saxlanmır**.
- Rollar arasında fərq qoyulmur: istənilən daxil olmuş istifadəçi (admin, hr) qrafiki dəyişə bilər.
- Yeni asılılıq yoxdur (`exceljs` artıq var).

## Məlumat modeli (`src/db.js`, `CREATE TABLE IF NOT EXISTS`)

```sql
CREATE TABLE IF NOT EXISTS qrafik_sablonlari (
  id INTEGER PRIMARY KEY, acar TEXT NOT NULL UNIQUE, ad TEXT NOT NULL, sira INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sablon_saatlari (          -- şablon saatının tarixçəsi
  sablon_id INTEGER NOT NULL REFERENCES qrafik_sablonlari(id),
  bas TEXT NOT NULL,                                   -- YYYY-MM-DD, bu gündən etibarən
  baslama TEXT NOT NULL, bitme TEXT NOT NULL,          -- HH:MM
  kim TEXT NOT NULL, yaradilib TEXT NOT NULL,
  PRIMARY KEY (sablon_id, bas)
);
CREATE TABLE IF NOT EXISTS emekdas_qrafik (            -- əməkdaşa təyinatın tarixçəsi
  emekdas_id TEXT NOT NULL REFERENCES emekdaslar(id),
  bas TEXT NOT NULL,
  sablon_id INTEGER REFERENCES qrafik_sablonlari(id),  -- şablon VƏ YA fərdi saat (biri dolu)
  baslama TEXT, bitme TEXT,
  menbe TEXT NOT NULL,                                 -- 'excel' | 'el'
  kim TEXT NOT NULL, yaradilib TEXT NOT NULL,
  PRIMARY KEY (emekdas_id, bas)
);
CREATE TABLE IF NOT EXISTS kadr_melumati (             -- son yüklənmiş Excel-dən (yalnız uyğunlaşdırılanlar)
  emekdas_id TEXT NOT NULL REFERENCES emekdaslar(id),
  sira INTEGER NOT NULL,                               -- 0 = qrafik götürülən (Əsas) sətir
  muessise TEXT, vezife TEXT, isci_qrup TEXT, tip TEXT, stat REAL, is_vaxti TEXT,
  yuklenib TEXT NOT NULL,
  PRIMARY KEY (emekdas_id, sira)
);
```

- Şablonlar baza açılanda yoxdursa yaradılır; onların ilk `sablon_saatlari` sətri `bas = '2000-01-01'`, `kim = 'sistem'`.
- Eyni (`emekdas_id`, `bas`) və ya (`sablon_id`, `bas`) üçün yeni yazı köhnəni əvəz edir (upsert).
- `kadr_melumati` hər yükləmədə uyğunlaşdırılan əməkdaşlar üçün tam yenilənir (köhnə sətirləri silinib yenidən yazılır).

## Qrafikin tapılması (`src/qrafik.js`)

Bir əməkdaşın `tarix` günündəki saatı:
1. `emekdas_qrafik`-də `bas <= tarix` olan ən son sətir.
2. Sətir şablondursa — `sablon_saatlari`-da həmin şablonun `bas <= tarix` olan ən son saatı; fərdidirsə — öz saatı.
3. Təyinat yoxdursa — `.env`-dəki `k.isBaslama`/`k.isBitme` (köhnə davranış; hesabatlar dəyişmir).

İnterfeys:
- `qrafikXeritesi(db, k, ids, bas, son)` → `(emekdasId, tarix) => {isBaslama, isBitme, ad}` — bütün lazımi sətirləri iki
  sorğu ilə əvvəlcədən yükləyir (əməkdaş başına sorğu yox). `ad`: şablon adı, `"Fərdi"` və ya `"Standart"`.
- `qrafikTap(db, k, emekdasId, tarix)` — tək əməkdaş üçün eyni nəticə.

## Hesablamaya təsir

- `gunHesabla` dəyişmir.
- `gunSetri(tarix, hadiseler, k, ...)` əməkdaşın həmin günkü `{isBaslama, isBitme}`-ni `k` əvəzinə qəbul edir; nəticəyə
  `qrafik: {ad, baslama, bitme}` əlavə olunur.
- `hesabatQur`, `/api/umumi` ("Bu gün diqqət"), `/api/emekdaslar`, `/api/emekdaslar/:id` `qrafikXeritesi` işlədir.
- Hesabat Excel-inə (gün-gün vərəqi) "Qrafik" sütunu (məs. `09:00–17:30`) əlavə olunur; xülasə vərəqinə əməkdaşın
  aralığın son günündəki qrafik adı.

## Excel yükləmə (`src/kadr.js`)

**Oxuma.** İlk vərəq, birinci sətir başlıqdır. Sütunlar başlıq mətninə görə tapılır (sıra fərq etmir, boşluq/hərf
böyüklüyü nəzərə alınmır). Məcburi: `Adı`, `Soyadı`, `İşçilərin tipi`, `Ştat vahidi`, `İş vaxtı`. İxtiyari:
`Atasının adı`, `Müəssisənin adı`, `Vəzifəsi`, `İşçi qrup`, `İşdən çıxma sən. tarixi`. Məcburi sütun yoxdursa — 400 və
hansı sütunun çatmadığı. Başqa sütunlar oxunmur. Fayl ən çox 5 MB, 20 000 sətir.

**Ad qatlama (`qatla`).** Kiçik hərf; `ə a → e`, `ı i İ → i`, `ö → o`, `ü → u`, `ş → s`, `ç → c`, `ğ → g`; sonra
`sh → s`, `ch → c`, `gh → g`, `j → c`, `w → v`; yalnız `a-z` qalır. (Kamera bazası fayl adlarında "ə" adətən "e" yazılır:
Həsənov → Hesenov; `normal()` isə "ə"-ni "a" edir — ona görə ayrıca qatlama.)

**Şəxslər.** Excel sətirləri (qatlanmış ad, soyad, ata) üzrə qruplaşdırılır — bir şəxsin bir neçə vəzifəsi ola bilər.
`İşdən çıxma sən. tarixi` dolu və qüvvəyə minmə tarixindən əvvəl/bərabər olan sətirlər atılır ("işdən çıxıb" sayı).

**Əsas sətir.** `İşçilərin tipi = Əsas` olan; yoxdursa ən böyük ştatlı; bərabərdirsə birinci.

**Şablon seçimi (Əsas sətirdən).** `İş vaxtı = Qisaldılmış` → `qisaldilmis`; `Natamam` → `natamam`; əks halda ştat:
`1 → tam_1`, `0.75 → stat_075`, `0.5 → stat_05`, `0.25 → stat_025`. Başqa ştat dəyəri → `tam_1` və nəticədə xəbərdarlıq.

**Uyğunlaşdırma** (yalnız aktiv əməkdaşlarla; açar = qatlanmış ad + soyad):
- **tapıldı**: açar tam bir aktiv əməkdaşa uyğundur və həmin əməkdaşa Excel-dən başqa şəxs düşmür. Hər iki tərəfdə ata
  adı varsa, o da uyğun gəlməlidir.
- **çoxmənalı**: açar iki+ əməkdaşa uyğundur (ata adı ayırmırsa) və ya Excel-dən iki+ şəxs bir əməkdaşa düşür —
  avtomatik təyin olunmur.
- **ehtimal**: tam uyğunluq yoxdur, amma ad eyni və soyad 1 hərf fərqli, soyad eyni və ad 1 hərf fərqli, və ya ad/soyad
  yeri dəyişib — avtomatik təyin olunmur, "Təsdiqlə" ilə.
- **sistemdə yoxdur**: qalanlar.

**Təyinat (tapılanlar və təsdiqlənənlər).** Qüvvəyə minmə tarixi `bas` (formadan, standart bu gün):
- həmin tarixdəki qüvvədə olan təyinat `menbe = 'el'`-dirsə — toxunulmur (nəticədə "əl ilə dəyişilib, qorundu" sayı);
- eyni şablondursa — heç nə yazılmır;
- əks halda `emekdas_qrafik`-ə (`bas`, şablon, `menbe = 'excel'`) yazılır.
- `kadr_melumati` həmin əməkdaş üçün yenilənir.
- Bütün yükləmə bir əməliyyatdadır (`emeliyyat`).

## API (hamısı sessiya ilə; dəyişənlər `X-Aztu: 1` başlığı ilə — mövcud qayda)

- `GET /api/qrafik/sablonlar` → `[{id, acar, ad, baslama, bitme, saatlar: [{bas, baslama, bitme, kim}], emekdasSayi}]`
  (`baslama/bitme` — bu günkü; `emekdasSayi` — bu gün bu şablonda olanlar).
- `POST /api/qrafik/sablonlar/:id/saat` `{bas, baslama, bitme}`.
- `GET /api/emekdaslar/:id/qrafik` → `{indiki: {ad, baslama, bitme, menbe, bas}, tarixce: [...], kadr: [...]}`.
- `POST /api/emekdaslar/:id/qrafik` `{bas, sablon_id}` və ya `{bas, baslama, bitme}` → `menbe = 'el'`.
- `POST /api/kadr/yukle?bas=YYYY-MM-DD` — gövdə xam `.xlsx` (`application/octet-stream`, ən çox 5 MB) →
  `{bas, cemi, tapildi, qorundu, deyismedi, yazildi, isdenCixib, xeberdarliqlar, ehtimal: [...], coxmenali: [...],
  yoxdur: [...]}`. Siyahılardakı hər element: Excel sətirlərinin göstərilən sahələri; `ehtimal`/`coxmenali` — namizəd
  əməkdaşlar (`id`, ad, soyad, şöbə, vəzifə) da.
- `POST /api/kadr/tesdiq` `{bas, emekdas_id, setirler: [...]}` — ehtimal/çoxmənalı şəxsi seçilmiş əməkdaşa təyin edir
  (şablon `setirler`-dən yuxarıdakı qayda ilə seçilir).
- `POST /api/kadr/excel` `{setirler: [...]}` → "sistemdə yoxdur" siyahısının `.xlsx`-i.

Yoxlamalar: saat `HH:MM`, `baslama < bitme`; tarix mövcud gün; şablon/əməkdaş mövcuddur; səhv → 400 `{xeta}`. `kim` —
daxil olmuş istifadəçinin adı. Hər dəyişiklik jurnala (`log.info`) yazılır.

## Panel (`public/static/app.js`)

- **Əməkdaşlar səhifəsi**: "Kadr siyahısı yüklə" düyməsi → pəncərə: fayl + qüvvəyə minmə tarixi → nəticə: rəqəmlər,
  "Ehtimal" (namizəd + "Təsdiqlə"), "Çoxmənalı" (namizəd seçimi + "Təsdiqlə"), "Sistemdə yoxdur" (cədvəl + "Excel endir").
  Siyahıda əməkdaşın yanında qrafik saatı.
- **Əməkdaş kartı**: "İş qrafiki" bloku — indiki qrafik, Excel məlumatı (müəssisə, vəzifə, tip, ştat, əvəzçilik
  sətirləri), "Dəyiş" (şablon və ya fərdi saat + tarix), tarixçə.
- **Yeni "Qrafik şablonları" səhifəsi** (`#/qrafikler`, menyuda): şablonlar, bu günkü saat, əməkdaş sayı, "Saatı dəyiş"
  (tarix + saat), saat tarixçəsi.
- Hesabat cədvəlində "Qrafik" sütunu.

## Xəta halları

- Excel deyil / pozuq fayl → 400 "Excel faylı oxunmadı".
- Məcburi sütun yoxdur → 400, sütunun adı ilə.
- Boş ad/soyad sətri → atılır, `xeberdarliqlar`-a say.
- Tanınmayan ştat → `tam_1` + xəbərdarlıq.
- Gələcək tarixli dəyişiklik icazəlidir (bu günə qədər köhnə qrafik işləyir).

## Testlər (yalnız uydurma adlar: Əli Vəliyev, Leyla Həsənova və s.)

- `test/qrafik.test.js`: tarixli təyinat seçimi (dəyişiklikdən əvvəlki/sonrakı gün); şablon saatının tarixçəsi; təyinat
  yoxdursa `.env` saatı; fərdi saat.
- `test/kadr.test.js`: qatlama (Həsənov = Hesenov, Cəlilov = Jalilov); Əsas sətir seçimi; şablon seçimi (qısaldılmış,
  0,5, tanınmayan ştat); tapıldı / ehtimal / çoxmənalı / yoxdur; işdən çıxan sətir; yenidən yükləmədə `el` təyinatın
  qorunması; dəyişməyən şablon üçün yazı olmaması; FİN sütunu olan faylda FİN-in heç bir cavabda/bazada olmaması.
- `test/api.test.js`: qrafik dəyişib gecikmənin fərdi saata görə hesablanması; köhnə günün rəqəminin dəyişməməsi;
  yükləmə endpoint-i (exceljs ilə yaddaşda qurulmuş fayl); yoxlama xətaları (400).

## Əhatədən kənar

- Həftə günü üzrə fərqli qrafik, növbəli iş, bayram günləri.
- Rollar üzrə icazə fərqi.
- Kamera bazasında olmayan əməkdaşların HR-ə əlavə edilməsi (onlar kamera bazasına şəkillə düşəndə avtomatik gəlir).
