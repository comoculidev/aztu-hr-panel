// Axtarış: Azərbaycan hərfləri ilə və onlarsız ("Huseyn" = "Hüseyn", "Eli" = "Əli" = "Ali").
// Kamera sistemindəki aztu_uz/axtaris.py ilə eyni qayda: klaviaturada "ə" çox vaxt "e" yazılır, bazadakı fayl
// adlarında isə "a" olur. Ona görə hər mətn iki formada saxlanır (ə→e və ə→a), sorğunun hər sözü onlarda axtarılır.

const E = { ə: 'e', Ə: 'e', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u', ş: 's', Ş: 's', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g' };
const A = { ə: 'a', Ə: 'a' };

const cevir = (s, xerite) => [...s].map((c) => xerite[c] ?? c).join('');
// toLowerCase "İ"-ni "i̇" (iki simvol) edir — əvvəl xəritə, sonra kiçik hərf
const sade = (s) => s.toLowerCase().replace(/[^0-9a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function formalar(...hisseler) {
  const metn = hisseler.filter(Boolean).join(' ');
  return `${sade(cevir(metn, E))} | ${sade(cevir(cevir(metn, A), E))}`;
}

export const sozler = (sorgu) => sade(cevir(String(sorgu ?? ''), E)).split(' ').filter(Boolean);

export const uygundur = (sorguSozleri, axtarisMetni) => sorguSozleri.every((s) => axtarisMetni.includes(s));
