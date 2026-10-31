// İş vaxtının hesabı (bir əməkdaş, bir gün). Qayda (HR):
//   - gəliş  = günün ilk girişi;
//   - çıxış  = günün son çıxışı (ondan sonra yenidən giriş yoxdursa);
//   - gün içindəki çıxış → giriş boşluqları = işdə olmama vaxtı (məs. 14:00 çıxıb 15:00 qayıdıb → 1 saat);
//   - işdə olma = (çıxış − gəliş) − işdə olmama. Son çıxışdan sonrakı vaxt (evə gediş) boşluq deyil.
// Kameralar hər keçidi görməyə bilər, ona görə natamam ardıcıllıqlar ehtiyatla hesablanır və "qeyd" ilə göstərilir:
// heç vaxt əməkdaşın əleyhinə təxmin edilmir (görünməyən qayıdışın boşluğu sayılmır).

export const saniye = (saat) => {
  const [h, m, s = 0] = String(saat).split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

export const saatYaz = (san) => {
  const s = Math.max(0, Math.round(san));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
};

export const muddetYaz = (san) => {
  if (san === null || san === undefined) return '—';
  const deq = Math.round(san / 60);
  return `${Math.floor(deq / 60)}:${String(deq % 60).padStart(2, '0')}`;
};

/**
 * @param {{saat: string, istiqamet: 'giris'|'cixis'}[]} hadiseler — eyni günün hadisələri, istənilən sırada
 * @param {{isBaslama?: string, isBitme?: string, birlesmeSan?: number, indi?: string|null}} ayar
 *   indi — yalnız bu gün üçün (HH:MM:SS): hələ binadadırsa iş vaxtı indiyə qədər sayılır
 */
export function gunHesabla(hadiseler, { isBaslama = '09:00', isBitme = '18:00', birlesmeSan = 60, indi = null } = {}) {
  const sirali = [...hadiseler]
    .map((x) => ({ ...x, t: saniye(x.saat) }))
    .sort((a, b) => a.t - b.t);
  // eyni istiqamətdə ardıcıl, 60 san ərzində — bir keçid (adam iki kameranın qarşısından keçib)
  const kecidler = [];
  for (const x of sirali) {
    const son = kecidler[kecidler.length - 1];
    if (son && son.istiqamet === x.istiqamet && x.t - son.t <= birlesmeSan) continue;
    kecidler.push(x);
  }
  const netice = {
    gelis: null, cixis: null, sonGorunme: null, olmamaSan: 0, isdeSan: null, bosluqlar: [],
    gecikmeSan: 0, erkenCixisSan: 0, binadadir: false, kecidSayi: kecidler.length, qeydler: [],
  };
  if (!kecidler.length) return netice;

  const qeyd = (m) => { if (!netice.qeydler.includes(m)) netice.qeydler.push(m); };
  netice.sonGorunme = kecidler[kecidler.length - 1].saat;
  // gəliş — günün ilk hadisəsi; o çıxışdırsa, adam görünmədən içəri keçib (giriş kamerası onu görməyib)
  const ilk = kecidler[0];
  const gelisT = ilk.t;
  netice.gelis = ilk.saat;
  let icerde = ilk.istiqamet === 'giris';
  if (!icerde) qeyd('giriş qeydə alınmayıb');
  let cixisT = icerde ? null : ilk.t;
  let cixisSaat = icerde ? null : ilk.saat;

  for (const x of kecidler.slice(1)) {
    if (x.istiqamet === 'cixis') {
      if (!icerde) qeyd('giriş qeydə alınmayıb');   // çöldə yenə çıxış: qayıdış görünməyib, boşluq sayılmır
      icerde = false;
      cixisT = x.t;
      cixisSaat = x.saat;
    } else if (!icerde) {
      const san = x.t - cixisT;
      netice.bosluqlar.push({ cixis: cixisSaat, qayitma: x.saat, san });
      netice.olmamaSan += san;
      icerde = true;
    }
    // içəridə yenə giriş: ikinci kamera və ya çıxış görünməyib — sayılmır
  }

  if (icerde) {
    netice.binadadir = indi !== null;
    if (indi !== null) {
      netice.isdeSan = Math.max(0, saniye(indi) - gelisT - netice.olmamaSan);
    } else {
      qeyd('çıxış qeydə alınmayıb');
    }
  } else {
    netice.cixis = cixisSaat;
    netice.isdeSan = Math.max(0, cixisT - gelisT - netice.olmamaSan);
    netice.erkenCixisSan = Math.max(0, saniye(isBitme) - cixisT);
  }
  netice.gecikmeSan = Math.max(0, gelisT - saniye(isBaslama));
  return netice;
}

/** bas..son (daxil) tarixləri, YYYY-MM-DD */
export function gunler(bas, son) {
  const netice = [];
  const d = new Date(`${bas}T00:00:00Z`);
  const s = new Date(`${son}T00:00:00Z`);
  while (d <= s) {
    netice.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return netice;
}

/** Bazar ertəsi – cümə. Bayram günləri v1-də nəzərə alınmır. */
export const isGunudur = (tarix) => {
  const g = new Date(`${tarix}T00:00:00Z`).getUTCDay();
  return g >= 1 && g <= 5;
};
