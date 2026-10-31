// Tema səhifə çəkilməzdən əvvəl tətbiq olunur (ağ-qara yanıb-sönmə olmasın). Seçim: auto | light | dark.
(function () {
  let t = 'auto';
  try { t = localStorage.getItem('aztu-tema') || 'auto'; } catch (e) { /* gizli pəncərə — standart */ }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
}());
