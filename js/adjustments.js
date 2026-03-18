/**
 * Pixel-level image adjustments.
 */
import { clamp } from './utils.js';

/**
 * Adjust brightness of ImageData.
 * @param {ImageData} imageData
 * @param {number} value  -100 to 100
 * @returns {ImageData}
 */
export function applyBrightness(imageData, value) {
    const data = new Uint8ClampedArray(imageData.data);
    const factor = (value / 100) * 255;
    for (let i = 0; i < data.length; i += 4) {
        data[i]     = clamp(data[i] + factor, 0, 255);
        data[i + 1] = clamp(data[i + 1] + factor, 0, 255);
        data[i + 2] = clamp(data[i + 2] + factor, 0, 255);
    }
    return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Adjust contrast of ImageData.
 * @param {ImageData} imageData
 * @param {number} value  -100 to 100
 * @returns {ImageData}
 */
export function applyContrast(imageData, value) {
    const data = new Uint8ClampedArray(imageData.data);
    const factor = (259 * (value + 255)) / (255 * (259 - value));
    for (let i = 0; i < data.length; i += 4) {
        data[i]     = clamp(factor * (data[i] - 128) + 128, 0, 255);
        data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128, 0, 255);
        data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128, 0, 255);
    }
    return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Adjust saturation of ImageData.
 * @param {ImageData} imageData
 * @param {number} value  -100 to 100
 * @returns {ImageData}
 */
export function applySaturation(imageData, value) {
    const data = new Uint8ClampedArray(imageData.data);
    const adjustment = value / 100 + 1; // 0 = fully desaturated, 1 = original, 2 = double
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        data[i]     = clamp(gray + adjustment * (data[i] - gray), 0, 255);
        data[i + 1] = clamp(gray + adjustment * (data[i + 1] - gray), 0, 255);
        data[i + 2] = clamp(gray + adjustment * (data[i + 2] - gray), 0, 255);
    }
    return new ImageData(data, imageData.width, imageData.height);
}
