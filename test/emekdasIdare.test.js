// Kadr idarəsi: əlavə, redaktə, silmə, telefondan şəkil linki (bir dəfəlik, 24 saat).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bazaAc } from '../src/db.js';
import { SorguXetasi, emekdasSec } from '../src/hesabat.js';
import {
  LINK_MS, emekdasDeyis, emekdasElave, emekdasSil, jpegdir, linkTap, linkVeziyyeti, linkYarat, linkleSekilYaz, sahelerOxu, sekilYaz,
} from '../src/emekdasIdare.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 3)]);
const JPEG2 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(100, 9)]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const setir = (db, id) => db.prepare('SELECT * FROM emekdaslar WHERE id = ?').get(id);

test('sahelerOxu: trim, məcburi ad/soyad, uzunluq, sətir olmayan dəyər', () => {
  assert.deepEqual(sahelerOxu({ ad: ' Əli ', soyad: 'Vəliyev', sobe: 5 }), { ad: 'Əli', soyad: 'Vəliyev', ata: '', sobe: '', vezife: '' });
  assert.throws(() => sahelerOxu({ ad: '  ', soyad: 'Vəliyev' }), SorguXetasi);
  assert.throws(() => sahelerOxu({ ad: 'Əli' }), SorguXetasi);
  assert.throws(() => sahelerOxu({ ad: 'a'.repeat(101), soyad: 'Vəliyev' }), SorguXetasi);
  assert.throws(() => sahelerOxu({ ad: 'Əli', soyad: 'Vəliyev', sobe: 'x'.repeat(201) }), SorguXetasi);
  assert.throws(() => sahelerOxu(null), SorguXetasi);
});

test('jpegdir: yalnız JPEG imzası', () => {
  assert.equal(jpegdir(JPEG), true);
  assert.equal(jpegdir(PNG), false);
  assert.equal(jpegdir(Buffer.alloc(0)), false);
  assert.equal(jpegdir('ffd8ff'), false);
});

test('emekdasElave: el- id, menbe el, axtarışda görünür', () => {
  const db = bazaAc(':memory:');
  const id = emekdasElave(db, { ad: 'Tural', soyad: 'Nəbiyev', vezife: 'Laborant', sobe: 'Kimya' });
  assert.match(id, /^el-[0-9a-f]{12}$/);
  const e = setir(db, id);
  assert.deepEqual([e.menbe, e.aktiv, e.silinib, e.hr_duzelib, e.vezife], ['el', 1, 0, 0, 'Laborant']);
  assert.deepEqual(emekdasSec(db, { q: 'nebiyev' }).map((x) => x.id), [id]);
});

test('emekdasDeyis: HR düzəlişi, axtarış yenilənir; yoxdursa və ya silinibsə false', () => {
  const db = bazaAc(':memory:');
  const id = emekdasElave(db, { ad: 'Tural', soyad: 'Nəbiyev' });
  assert.equal(emekdasDeyis(db, id, { ad: 'Tural', soyad: 'Həsənli', vezife: 'Mühəndis' }), true);
  assert.deepEqual([setir(db, id).soyad, setir(db, id).hr_duzelib, setir(db, id).vezife], ['Həsənli', 1, 'Mühəndis']);
  assert.deepEqual(emekdasSec(db, { q: 'hesenli' }).map((x) => x.id), [id]);
  assert.deepEqual(emekdasSec(db, { q: 'nebiyev' }), []);
  assert.equal(emekdasDeyis(db, 'yoxdur', { ad: 'A', soyad: 'B' }), false);
  emekdasSil(db, id);
  assert.equal(emekdasDeyis(db, id, { ad: 'A', soyad: 'B' }), false);
});

test('emekdasSil: aktiv 0, silinib 1, açıq link bağlanır; yoxdursa false', () => {
  const db = bazaAc(':memory:');
  const id = emekdasElave(db, { ad: 'Tural', soyad: 'Nəbiyev' });
  const { token } = linkYarat(db, id, 'hr');
  assert.equal(emekdasSil(db, id), true);
  assert.deepEqual([setir(db, id).aktiv, setir(db, id).silinib], [0, 1]);
  assert.equal(linkTap(db, token).veziyyet, 'bagli');
  assert.equal(linkYarat(db, id, 'hr'), null);
  assert.equal(emekdasSil(db, 'yoxdur'), false);
  assert.equal(emekdasSil(db, id), false);                     // ikinci dəfə — artıq silinib
});

test('linkYarat: token heşlə saxlanır, 24 saat, yenisi köhnəni bağlayır', () => {
  const db = bazaAc(':memory:');
  const id = emekdasElave(db, { ad: 'Tural', soyad: 'Nəbiyev' });
  const indi = 1_800_000_000_000;
  const a = linkYarat(db, id, 'hr', indi);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.bitir, indi + LINK_MS);
  const heş = createHash('sha256').update(a.token).digest('hex');
  const satirlar = db.prepare('SELECT token_hash FROM sekil_linkleri').all();
  assert.deepEqual(satirlar.map((x) => x.token_hash), [heş]);
  assert.deepEqual(linkVeziyyeti(db, id, indi), { aciq: true, bitir: indi + LINK_MS, istifade: null });
  const b = linkYarat(db, id, 'hr', indi + 1000);
  assert.equal(linkTap(db, a.token, indi + 2000).veziyyet, 'bagli');
  assert.equal(linkTap(db, b.token, indi + 2000).veziyyet, 'aciq');
  assert.equal(linkYarat(db, 'yoxdur', 'hr'), null);
});

test('linkTap: yox / müddəti keçib / açıq', () => {
  const db = bazaAc(':memory:');
  const id = emekdasElave(db, { ad: 'Tural', soyad: 'Nəbiyev', vezife: 'Laborant' });
  const indi = 1_800_000_000_000;
  const { token, bitir } = linkYarat(db, id, 'hr', indi);
  assert.deepEqual(linkTap(db, 'yanlis-token', indi), { veziyyet: 'yox' });
  assert.deepEqual(linkTap(db, token, indi), { veziyyet: 'aciq', emekdas: { id, ad: 'Tural', soyad: 'Nəbiyev' } });
  assert.deepEqual(linkTap(db, token, bitir + 1), { veziyyet: 'bagli' });
  assert.equal(linkVeziyyeti(db, id, bitir + 1).aciq, false);
});

test('linkleSekilYaz: bir dəfəlik; ikinci sorğu bağlı, birinci şəkil qalır', () => {
  const db = bazaAc(':memory:');
  const id = emekdasElave(db, { ad: 'Tural', soyad: 'Nəbiyev' });
  const indi = 1_800_000_000_000;
  const { token } = linkYarat(db, id, 'hr', indi);
  assert.equal(linkleSekilYaz(db, token, JPEG, indi + 5), 'yazildi');
  assert.deepEqual(Buffer.from(setir(db, id).hr_sekil), JPEG);
  assert.ok(setir(db, id).hr_sekil_vaxt);
  const v = linkVeziyyeti(db, id, indi + 6);
  assert.equal(v.aciq, false);
  assert.ok(v.istifade);
  assert.equal(linkleSekilYaz(db, token, JPEG2, indi + 7), 'bagli');
  assert.deepEqual(Buffer.from(setir(db, id).hr_sekil), JPEG);
  assert.equal(linkleSekilYaz(db, 'yanlis', JPEG, indi), 'yox');
  const kohne = linkYarat(db, id, 'hr', indi);
  assert.equal(linkleSekilYaz(db, kohne.token, JPEG2, kohne.bitir + 1), 'bagli');   // müddəti keçib
});

test('sekilYaz: kompüterdən şəkil; yoxdursa false', () => {
  const db = bazaAc(':memory:');
  const id = emekdasElave(db, { ad: 'Tural', soyad: 'Nəbiyev' });
  assert.equal(sekilYaz(db, id, JPEG), true);
  assert.deepEqual(Buffer.from(setir(db, id).hr_sekil), JPEG);
  assert.equal(sekilYaz(db, 'yoxdur', JPEG), false);
});
