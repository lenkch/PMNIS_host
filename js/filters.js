/**
 * Image filters: grayscale, sepia, invert, blur.
 */
import { clamp } from './utils.js';

/**
 * Convert to grayscale.
 */
export function grayscale(imageData) {
    const data = new Uint8ClampedArray(imageData.data);
    for (let i = 0; i < data.length; i += 4) {
        const avg = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = avg;
    }
    return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply sepia tone.
 */
export function sepia(imageData) {
    const data = new Uint8ClampedArray(imageData.data);
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        data[i]     = clamp(0.393 * r + 0.769 * g + 0.189 * b, 0, 255);
        data[i + 1] = clamp(0.349 * r + 0.686 * g + 0.168 * b, 0, 255);
        data[i + 2] = clamp(0.272 * r + 0.534 * g + 0.131 * b, 0, 255);
    }
    return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Invert all colors.
 */
export function invert(imageData) {
    const data = new Uint8ClampedArray(imageData.data);
    for (let i = 0; i < data.length; i += 4) {
        data[i]     = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
    }
    return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Box blur with given radius.
 */
export function blur(imageData, radius = 3) {
    const { width, height } = imageData;
    const src = imageData.data;
    const dst = new Uint8ClampedArray(src.length);
    const size = radius * 2 + 1;
    const area = size * size;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let ky = -radius; ky <= radius; ky++) {
                for (let kx = -radius; kx <= radius; kx++) {
                    const px = clamp(x + kx, 0, width - 1);
                    const py = clamp(y + ky, 0, height - 1);
                    const idx = (py * width + px) * 4;
                    r += src[idx];
                    g += src[idx + 1];
                    b += src[idx + 2];
                    a += src[idx + 3];
                }
            }
            const idx = (y * width + x) * 4;
            dst[idx]     = r / area;
            dst[idx + 1] = g / area;
            dst[idx + 2] = b / area;
            dst[idx + 3] = a / area;
        }
    }
    return new ImageData(dst, width, height);
}
