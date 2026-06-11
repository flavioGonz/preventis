// Comprime imagenes en el cliente antes de subir/encolar (tablets sacan fotos pesadas).
// Redimensiona a max 1600px y exporta JPEG ~0.8. Si no es imagen, devuelve el archivo igual.
const MAXDIM = 1600, QUALITY = 0.8;

export function compressToDataURL(file, maxDim = MAXDIM, quality = QUALITY) {
  return new Promise((resolve) => {
    if (!file || !/^image\//.test(file.type) || /svg/.test(file.type)) {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxDim || h > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(cv.toDataURL('image/jpeg', quality)); }
      catch { resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); };
    img.src = url;
  });
}

export function dataURLtoBlob(d) {
  const [h, b] = d.split(',');
  const mime = (h.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: mime });
}

// Comprime y devuelve un File listo para subir online
export async function compressToFile(file, name) {
  const d = await compressToDataURL(file);
  if (!d) return file;
  const blob = dataURLtoBlob(d);
  return new File([blob], name || (file.name || 'imagen').replace(/\.\w+$/, '') + '.jpg', { type: blob.type });
}
