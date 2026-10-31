# AzTU HR paneli

Universitet girişindəki üz tanıma sisteminin ([Face_recognation](https://github.com/AzadSkairipa/Face_recognation),
branch `server-panel-test`) əməkdaş keçidlərini qəbul edən və HR üçün göstərən veb panel.

- **Kamera sistemi** (192.0.2.77) olduğu kimi işləyir; əməkdaş keçidlərini və əməkdaş siyahısını (şəkli ilə) bu serverə
  API ilə göndərir. Server əlçatmaz olanda hadisələr kamera kompüterində növbədə gözləyir, itmir.
- **Bu server** (192.0.2.50): Node.js + SQLite. Login → 4 səhifə:
  1. **Ümumi görünüş** — ümumi keçid, əməkdaş keçidi, işə gələn əməkdaş, tələbə və tanınmayan sayı; bu gün binada olan,
     gecikən; saat/gün qrafiki; son hadisələr (kamera və növ filtri, 15 san-da bir yenilənir); kamera sisteminin siqnalı.
  2. **Əməkdaşlar** — axtarış (ad, soyad, ata adı, şöbə, vəzifə; "Eli" = "Əli"), şöbə və vəzifə filtri, bu günün
     vəziyyəti üzrə düymələr (binadadır / çıxıb / gəlməyib / gecikib). Əməkdaşın kartı: şəkli, bu gün gəliş/çıxış,
     **günün zaman xətti** (binada / kənarda / iş qrafiki), **kənarda olduğu vaxtlar** — həm saat aralığı, həm müddət
     (`13:35 → 14:44 · 1 saat 9 dəq`) və cəmi, keçidlər, tarixçə (hər gün mini zaman xətti ilə) + Excel.
  3. **Hadisələr** — tanınmayan keçidlər kameranın çəkdiyi üz şəkli ilə (son 30 gün). Ayrı-ayrı süzgəc: tarix
     (bu gün, dünən, son 7 / 30 gün, gün seçimi), qapı (kamera), saat aralığı; karta klik → böyük şəkil və
     "Bu adamın bütün keçidləri" (sistemin yad adama verdiyi G-nömrəsi ilə — başqa qapılarda və qayıdanda).
  4. **Hesabat** — gün, ay, son 7 gün və ya aralıq; şöbə, vəzifə, axtarış; sıralanan xülasə cədvəli (davamiyyət %,
     gəlmədiyi gün, işdə, kənarda, gecikmə, orta gəliş); əməkdaşa klik → yan pəncərədə onun günləri və öz Excel-i;
     **Excel-ə çıxar** — ekranda nə seçilibsə (Xülasə, Gündəlik, Parametrlər vərəqləri).
  - Açıq / tünd tema (yan menyuda), mobil görünüş, "son yenilənmə" vaxtı.

Dizayn və API razılaşması: [docs/dizayn.md](docs/dizayn.md).

> Sənədlərdəki ünvanlar nümunədir: **192.0.2.50** — HR serveri, **192.0.2.77** — kamera kompüteri. Həqiqi ünvanlar
> yalnız git-ə düşməyən fayllarda yazılır: serverdə `.env` (`INGEST_IP`), kamera kompüterində `konfiq.toml` (`[hr_server] url`).

## İş vaxtı qaydası
- **Gəliş** = günün ilk girişi, **çıxış** = günün son çıxışı.
- Gün içində çıxıb qayıtma (məs. 14:00 çıxıb 15:00 qayıdıb) iş çıxışı sayılmır — **işdə olmama** vaxtıdır.
- **İşdə olma** = (çıxış − gəliş) − işdə olmama.
- Kamera keçidi görməyibsə (giriş və ya çıxış yoxdur), sətirdə qeyd yazılır və əməkdaşın əleyhinə təxmin edilmir.
- Gecikmə və erkən çıxış iş qrafikinə görədir (`IS_BASLAMA`, `IS_BITME`, standart 09:00–18:00, B.e.–Cümə).
- Hadisəsi olmayan iş günü "gəlməyib" sayılır (bayramlar v1-də nəzərə alınmır).

## Quraşdırma (server 192.0.2.50)
Node.js ≥ 22.13 lazımdır (daxili `node:sqlite` üçün; tövsiyə: 24 LTS).

```bash
sudo useradd --system --home /opt/aztu-hr-panel aztu-hr
sudo git clone <bu repo> /opt/aztu-hr-panel && cd /opt/aztu-hr-panel
sudo npm ci --omit=dev
sudo cp .env.example .env && sudo nano .env       # INGEST_ACAR, INGEST_IP=192.0.2.77
sudo mkdir -p data && sudo chown -R aztu-hr: data .env && sudo chmod 600 .env
sudo -u aztu-hr npm run istifadeci -- hr.admin admin     # ilk istifadəçi (parol gizli soruşulur)
sudo cp deploy/aztu-hr-panel.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now aztu-hr-panel
```
Panel: `http://192.0.2.50:3000`. Yalnız daxili şəbəkədə; internetə açılmamalıdır. HTTPS lazımdırsa nginx arxasına qoyun
və `.env`-də `TEHLUKESIZ_KUKI=true`, `PROXY_ETIBAR=true` yazın.

**Firewall:** 3000 portu HR kompüterlərinə və kamera kompüterinə (192.0.2.77) açıq olsun, qalanlarına bağlı.

### İstifadəçilər
```bash
npm run istifadeci -- <ad> [admin|hr]     # yarat və ya parolu dəyiş
npm run istifadeci -- --siyahi
npm run istifadeci -- --sondur <ad>       # girişi bağla
```
Parol ən azı 10 simvoldur; 5 səhv cəhddən sonra həmin IP + ad 15 dəqiqə bloklanır.

### Əməkdaş siyahısına düşmüş tələbələr
Kamera bazasında bəzi tələbələrin vəzifəsi `STUDENT` yazılıb və ya qrup kodu (`5226a`) şöbə yerinə düşüb. Köhnə
versiyalı kamera onları əməkdaş kimi göndərirdi. İndi nə kamera onları göndərir, nə də server qəbul edir. Əvvəl
yığılmış qeydləri təmizləmək üçün (əvvəlcə kamera kompüterini yeniləyin):
```bash
npm run telebe-temizle              # yalnız siyahını göstərir, heç nə dəyişmir
npm run telebe-temizle -- --sil     # adı və şəkli silinir; keçidləri adsız "tələbə" keçidi olaraq qalır
```

### Server Windows-dadırsa
```powershell
cd C:ztu-hr-panel
npm ci --omit=dev
copy .env.example .env      # notepad .env — INGEST_ACAR, INGEST_IP
npm run istifadeci -- hr.admin admin
npm start                   # sınaq üçün; daimi iş üçün aşağıdakı tapşırıq
```
Avtomatik başlama: Task Scheduler → "At startup", istifadəçi: SYSTEM, proqram `node`, arqument `src\server.js`,
"Start in": `C:ztu-hr-panel`. Firewall: `New-NetFirewallRule -DisplayName "AzTU HR" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow`.

## Kamera sistemini qoşmaq (192.0.2.77)
1. Açar yaradın: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. Serverin `.env`-ində `INGEST_ACAR=<açar>`, `INGEST_IP=192.0.2.77`.
3. Kamera kompüterində `deploy/muhit.env`-ə `HR_API_ACAR=<eyni açar>`, `konfiq.toml`-a:
   ```toml
   [hr_server]
   url = "http://192.0.2.50:3000"
   acar = "${HR_API_ACAR}"
   ```
4. Bağlantını yoxlayın (kameralar açılmır, parol lazım deyil):
   ```
   python uz_tanima_test.py --konfiq konfiq.toml --hr-yoxla
   ```
   `✔ Açar və IP düzdür` görünməlidir; `✖` olsa, sətir nəyin səhv olduğunu deyir (server cavab vermir / açar / IP).
5. Kamera xidmətini yenidən başladın. Panelin yan menyusunda "Kameralar onlayn" görünür; əməkdaş siyahısı və
   şəkillər (240 px) bir neçə dəqiqəyə gəlir.

## Canlı test — yoxlama siyahısı
1. **Server:** brauzerdə `http://<server>:3000/api/saglamliq` → `{"ok":true,"kameraApi":true}`.
2. **Giriş:** `http://<server>:3000` → login → "Ümumi görünüş" açılır.
3. **Bağlantı:** kamera kompüterində `--hr-yoxla` → `✔`. Yan menyuda "Kameralar onlayn · T1, T2, …".
4. **Əməkdaş siyahısı:** "Əməkdaşlar" səhifəsində sayı bazadakı əməkdaş sayına bərabərdir (tələbələr yoxdur), şəkillər var.
5. **Keçid:** bazada olan bir əməkdaş giriş kamerasından keçir → 15 san ərzində "Son hadisələr"də adı, "Bu gün diqqət"
   → "Binada" siyahısında görünür.
6. **Kənarda olma:** həmin əməkdaş çıxış kamerasından çıxıb bir neçə dəqiqə sonra qayıdır → kartında zaman xəttində
   zolaqlı hissə, "Kənarda olduğu vaxt": `HH:MM → HH:MM · N dəq`, "Cəmi kənarda".
7. **Server düşəndə:** serveri dayandırın, bir neçə keçid edin, serveri başladın → keçidlər itmədən gəlir
   (kamera logunda "HR server yenidən əlçatandır").
8. **Excel:** "Hesabat" → "Excel-ə çıxar" → Xülasə, Gündəlik (kənarda olduğu vaxtlar + cəmi), Parametrlər vərəqləri.

Problem olsa: serverdə `journalctl -u aztu-hr-panel` (və ya `npm start` çıxışı), kamera kompüterində
`<cixis>/log/aztu.log` — "HR server" sətirləri.

## Məxfilik
- Tələbə keçidləri adsız gəlir (yalnız say). Tələbəyə oxşayan qeyd əməkdaş siyahısına qəbul edilmir
  (`src/telebe.js`, kamera ilə eyni qayda). Tanınmayanın kameradakı üzü (200 px) gəlir və **30 gün** saxlanır
  (`SEKIL_SAXLAMA_GUN`), sonra avtomatik silinir; kamera tərəfində `taninmayan_sekli = false` ilə söndürülür.
  Üz vektoru, əməkdaş və tələbənin kamera şəkli serverə gəlmir.
- `data/` (baza), `.env` git-ə düşmür. Bazanı ehtiyat nüsxə edin: `sqlite3 data/hr.db ".backup hr-$(date +%F).db"`.
- Kamera API-si: Bearer açar + IP icazəsi. Panel: sessiya kukisi (HttpOnly, SameSite=Strict), CSP, parol scrypt ilə.

## İnkişaf
```bash
npm install
npm test                 # 24 test: iş vaxtı, axtarış, API, hesabat, Excel, tanınmayanlar
npm start                # .env-dən oxuyur
```
Bilinən: `npm audit` exceljs-in daxili asılılığında (minimatch, arxiv yaradılması) orta səviyyəli xəbərdarlıq göstərir;
panel istifadəçi mətnini o koda ötürmür. exceljs yeniləndikdə yoxlayın.
