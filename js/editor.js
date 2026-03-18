/**
 * Core Editor class.
 * Manages the canvas, image loading, history, and applying operations.
 */
import { History } from './history.js';
import { fileToImage } from './utils.js';

export class Editor {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.history = new History(30);
        this.originalImage = null;   // The original loaded HTMLImageElement
        this.baseImageData = null;   // Snapshot used for non-destructive slider previews
        this.imageLoaded = false;

        this._onChangeCallbacks = [];
    }

    /**
     * Register a callback to be called whenever the canvas state changes.
     */
    onChange(cb) {
        this._onChangeCallbacks.push(cb);
    }

    _notifyChange() {
        this._onChangeCallbacks.forEach(cb => cb());
    }

    /**
     * Load an image from a File object.
     */
    async loadImage(file) {
        const img = await fileToImage(file);
        this.originalImage = img;

        // Limit max dimension to 4000px for performance
        let w = img.width;
        let h = img.height;
        const MAX = 4000;
        if (w > MAX || h > MAX) {
            const ratio = Math.min(MAX / w, MAX / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
        }

        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.drawImage(img, 0, 0, w, h);

        this.history.clear();
        this.history.push(this.getImageData());
        this.baseImageData = this.getImageData();
        this.imageLoaded = true;

        this._notifyChange();
    }

    /**
     * Get the current canvas ImageData.
     */
    getImageData() {
        return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Put ImageData onto the canvas (resizes canvas if needed).
     */
    putImageData(imageData) {
        if (this.canvas.width !== imageData.width || this.canvas.height !== imageData.height) {
            this.canvas.width = imageData.width;
            this.canvas.height = imageData.height;
        }
        this.ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Apply a pixel operation function.
     * The function receives the current ImageData and returns a new ImageData.
     * Pushes the result to history.
     */
    applyOperation(fn, ...args) {
        if (!this.imageLoaded) return;
        const current = this.getImageData();
        const result = fn(current, ...args);
        this.putImageData(result);
        this.history.push(result);
        this.baseImageData = this.getImageData();
        this._notifyChange();
    }

    /**
     * Apply a transform function that needs the canvas element.
     * The function receives the canvas and returns a new ImageData (possibly different dimensions).
     */
    applyTransform(fn) {
        if (!this.imageLoaded) return;
        const result = fn(this.canvas);
        this.putImageData(result);
        this.history.push(result);
        this.baseImageData = this.getImageData();
        this._notifyChange();
    }

    /**
     * Preview an adjustment without committing to history.
     * Uses baseImageData as the source.
     */
    previewAdjustment(fn, ...args) {
        if (!this.imageLoaded || !this.baseImageData) return;
        const result = fn(this.baseImageData, ...args);
        this.putImageData(result);
    }

    /**
     * Commit the current canvas state to history (used after slider adjustments).
     */
    commitAdjustment() {
        if (!this.imageLoaded) return;
        const current = this.getImageData();
        this.history.push(current);
        this.baseImageData = this.getImageData();
        this._notifyChange();
    }

    /**
     * Crop the canvas to the given bounds.
     */
    crop(bounds) {
        if (!this.imageLoaded) return;
        const { x, y, width, height } = bounds;
        const cropped = this.ctx.getImageData(x, y, width, height);
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.putImageData(cropped, 0, 0);
        this.history.push(this.getImageData());
        this.baseImageData = this.getImageData();
        this._notifyChange();
    }

    /**
     * Undo the last operation.
     */
    undo() {
        const data = this.history.undo();
        if (data) {
            this.putImageData(data);
            this.baseImageData = this.getImageData();
            this._notifyChange();
        }
    }

    /**
     * Redo the last undone operation.
     */
    redo() {
        const data = this.history.redo();
        if (data) {
            this.putImageData(data);
            this.baseImageData = this.getImageData();
            this._notifyChange();
        }
    }

    /**
     * Export the canvas as a data URL.
     */
    toDataURL(type = 'image/png', quality = 0.92) {
        return this.canvas.toDataURL(type, quality);
    }

    /**
     * Reset adjustments sliders to base state.
     */
    resetToBase() {
        if (this.baseImageData) {
            this.putImageData(this.baseImageData);
        }
    }
}
