# AzTU HR paneli

Universitet girişindəki üz tanıma sisteminin ([Face_recognation](https://github.com/AzadSkairipa/Face_recognation),
branch `server-panel-test`) əməkdaş keçidlərini qəbul edən və HR üçün göstərən veb panel.

- **Kamera sistemi** (192.0.2.77) olduğu kimi işləyir; əməkdaş keçidlərini və əməkdaş siyahısını (şəkli ilə) bu serverə
  API ilə göndərir. Server əlçatmaz olanda hadisələr kamera kompüterində növbədə gözləyir, itmir.
- **Bu server** (192.0.2.50): Node.js + SQLite. Login → 3 səhifə:
  1. **Ümumi görünüş** — ümumi keçid, əməkdaş keçidi, işə gələn əməkdaş, tələbə və tanınmayan sayı; bu gün binada olan,
     gecikən; saat/gün qrafiki; son hadisələr (kamera və növ filtri, 15 san-da bir yenilənir); kamera sisteminin siqnalı.
  2. **Əməkdaşlar** — axtarış (ad, soyad, ata adı, şöbə, vəzifə; "Eli" = "Əli"), şöbə və vəzifə filtri. Əməkdaşın kartı:
     şəkli, bu gün gəliş/çıxış, işdə olma və **işdə olmama** vaxtı (gün içində çıxıb-qayıtma), keçidlər, tarixçə + Excel.
  3. **Hesabat** — gün, ay, son 7 gün və ya aralıq; şöbə, vəzifə, axtarış; əməkdaşlar üzrə xülasə, seçilmiş əməkdaşın
     günləri; **Excel-ə çıxar** — ekranda nə seçilibsə (Xülasə, Gündəlik, Parametrlər vərəqləri).

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

## Kamera sistemini qoşmaq (192.0.2.77)
1. Açar yaradın: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. Serverin `.env`-ində `INGEST_ACAR=<açar>`, `INGEST_IP=192.0.2.77`.
3. Kamera kompüterində `deploy/muhit.env`-ə `HR_API_ACAR=<eyni açar>`, `konfiq.toml`-a:
   ```toml
   [hr_server]
   url = "http://192.0.2.50:3000"
   acar = "${HR_API_ACAR}"
   ```
4. Kamera xidmətini yenidən başladın. Panelin "Ümumi görünüş" səhifəsində "Kamera sistemi onlayn" görünməlidir;
   əməkdaş siyahısı bir neçə dəqiqəyə gəlir (şəkillər 240 px).

## Məxfilik
- Tələbə və tanınmayan keçidləri adsız gəlir (yalnız say). Üz vektoru və kamera kadrı serverə gəlmir.
- `data/` (baza), `.env` git-ə düşmür. Bazanı ehtiyat nüsxə edin: `sqlite3 data/hr.db ".backup hr-$(date +%F).db"`.
- Kamera API-si: Bearer açar + IP icazəsi. Panel: sessiya kukisi (HttpOnly, SameSite=Strict), CSP, parol scrypt ilə.

## İnkişaf
```bash
npm install
npm test                 # 22 test: iş vaxtı, axtarış, API, Excel
npm start                # .env-dən oxuyur
```
Bilinən: `npm audit` exceljs-in daxili asılılığında (minimatch, arxiv yaradılması) orta səviyyəli xəbərdarlıq göstərir;
panel istifadəçi mətnini o koda ötürmür. exceljs yeniləndikdə yoxlayın.
