// Resizes and compresses an image file in the browser before it's turned
// into a base64 data URL and sent to the server. Phone camera photos are
// often 2-8MB; at 600+ members that adds up fast against a free-tier
// database's storage cap. Resizing to a sensible avatar size and
// re-encoding as JPEG typically brings each photo down to 20-80KB - a
// 50-100x reduction - with no visible quality loss for an ID-card-sized
// photo.
export function compressImage(file, { maxDimension = 480, quality = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image, please try another.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}