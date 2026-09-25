export interface Crop {
  top: number; // porcentajes 0-45
  bottom: number;
  left: number;
  right: number;
}

export interface PageImage {
  id: string;
  name: string;
  url: string; // object URL del archivo original
  rotation: 0 | 90 | 180 | 270;
  crop: Crop;
}

export const noCrop: Crop = { top: 0, bottom: 0, left: 0, right: 0 };

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
    img.src = url;
  });
}

/** Dibuja la imagen girada y recortada en un canvas (máx. `maxSide` px por lado). */
export function renderPage(img: HTMLImageElement, rotation: number, crop: Crop, maxSide = 1800): HTMLCanvasElement {
  const rotated = document.createElement('canvas');
  const swap = rotation === 90 || rotation === 270;
  rotated.width = swap ? img.naturalHeight : img.naturalWidth;
  rotated.height = swap ? img.naturalWidth : img.naturalHeight;
  const rctx = rotated.getContext('2d');
  if (!rctx) throw new Error('El navegador no permite editar imágenes.');
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate((rotation * Math.PI) / 180);
  rctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const sx = (crop.left / 100) * rotated.width;
  const sy = (crop.top / 100) * rotated.height;
  const sw = rotated.width * (1 - (crop.left + crop.right) / 100);
  const sh = rotated.height * (1 - (crop.top + crop.bottom) / 100);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  out.getContext('2d')?.drawImage(rotated, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo preparar la imagen.'))), 'image/jpeg', 0.88),
  );
}

export async function processPage(page: PageImage): Promise<{ blob: Blob; previewUrl: string }> {
  const img = await loadImage(page.url);
  const canvas = renderPage(img, page.rotation, page.crop);
  const blob = await canvasToBlob(canvas);
  return { blob, previewUrl: URL.createObjectURL(blob) };
}
