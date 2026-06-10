export interface CompressedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  size: number;
}

export interface MenuImageSet {
  thumb: CompressedImage;
  medium: CompressedImage;
}

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('图片压缩失败'));
    }, 'image/webp', quality);
  });
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('图片缓存失败'));
    reader.readAsDataURL(blob);
  });
};

export const compressImage = async (
  file: File,
  maxSize: number,
  quality: number
): Promise<CompressedImage> => {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持图片压缩');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, quality);
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    width,
    height,
    size: blob.size
  };
};

export const compressMenuImage = async (file: File): Promise<MenuImageSet> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }

  return {
    thumb: await compressImage(file, 160, 0.72),
    medium: await compressImage(file, 800, 0.78)
  };
};
