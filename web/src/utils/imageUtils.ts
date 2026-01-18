/**
 * Resize an image and convert it to WebP format
 * All processing happens client-side - no server round trip needed
 *
 * @param file - The input file (from file input or drag/drop)
 * @param maxSize - Maximum width/height (default 100 for avatars)
 * @returns Promise<string> - Base64 encoded WebP image
 */
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
      // Calculate new dimensions (maintain aspect ratio, fit in maxSize square)
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

      // Convert to WebP (quality 0.85 is a good balance)
      const webpDataUrl = canvas.toDataURL('image/webp', 0.85);
      resolve(webpDataUrl);
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
