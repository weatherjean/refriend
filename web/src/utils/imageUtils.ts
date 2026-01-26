/**
 * Resize an image and convert it to WebP format
 * All processing happens client-side - no server round trip needed
 *
 * @param file - The input file (from file input or drag/drop)
 * @param maxSize - Maximum width/height (default 100 for avatars)
 * @returns Promise<string> - Base64 encoded WebP image
 */
export interface ResizedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Resize an image and convert it to WebP format, returning dimensions
 *
 * @param file - The input file (from file input or drag/drop)
 * @param maxSize - Maximum width/height
 * @returns Promise<ResizedImage> - Base64 encoded WebP image with dimensions
 */
export async function resizeImageWithDimensions(
  file: File,
  maxSize: number = 1000
): Promise<ResizedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      // Calculate new dimensions (maintain aspect ratio, fit in maxSize)
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      // Set canvas size and draw resized image
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Try WebP first, fall back to JPEG if browser doesn't support WebP encoding
      // (Safari on iOS/macOS doesn't support WebP encoding and silently returns PNG)
      let dataUrl = canvas.toDataURL('image/webp', 0.85);
      if (!dataUrl.startsWith('data:image/webp')) {
        // Browser doesn't support WebP encoding, use JPEG instead
        dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      }
      resolve({ dataUrl, width, height });
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Read file as data URL and load into image
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

export async function resizeAndConvertToWebP(
  file: File,
  maxSize: number = 100
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      // Center-crop to square, then resize to maxSize
      const size = Math.min(img.width, img.height);
      const srcX = (img.width - size) / 2;
      const srcY = (img.height - size) / 2;

      // Set canvas to target square size
      canvas.width = maxSize;
      canvas.height = maxSize;

      // Draw center-cropped square, scaled to maxSize
      ctx.drawImage(img, srcX, srcY, size, size, 0, 0, maxSize, maxSize);

      // Try WebP first, fall back to JPEG if browser doesn't support WebP encoding
      // (Safari on iOS/macOS doesn't support WebP encoding and silently returns PNG)
      let dataUrl = canvas.toDataURL('image/webp', 0.85);
      if (!dataUrl.startsWith('data:image/webp')) {
        // Browser doesn't support WebP encoding, use JPEG instead
        dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      }
      resolve(dataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Read file as data URL and load into image
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}
