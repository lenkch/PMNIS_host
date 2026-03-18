/**
 * History manager for undo/redo using ImageData snapshots.
 */
export class History {
    constructor(maxSize = 30) {
        this.stack = [];
        this.pointer = -1;
        this.maxSize = maxSize;
    }

    /**
     * Push a new ImageData snapshot onto the stack.
     * Discards any redo states beyond the current pointer.
     */
    push(imageData) {
        // Discard future states
        this.stack = this.stack.slice(0, this.pointer + 1);

        // Clone the ImageData so mutations don't affect history
        const clone = new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );
        this.stack.push(clone);

        // Cap the stack size
        if (this.stack.length > this.maxSize) {
            this.stack.shift();
        }

        this.pointer = this.stack.length - 1;
    }

    /**
     * Undo: return the previous ImageData snapshot.
     */
    undo() {
        if (!this.canUndo()) return null;
        this.pointer--;
        return this.getCurrent();
    }

    /**
     * Redo: return the next ImageData snapshot.
     */
    redo() {
        if (!this.canRedo()) return null;
        this.pointer++;
        return this.getCurrent();
    }

    canUndo() {
        return this.pointer > 0;
    }

    canRedo() {
        return this.pointer < this.stack.length - 1;
    }

    /**
     * Get the current ImageData (cloned).
     */
    getCurrent() {
        if (this.pointer < 0 || this.pointer >= this.stack.length) return null;
        const data = this.stack[this.pointer];
        return new ImageData(
            new Uint8ClampedArray(data.data),
            data.width,
            data.height
        );
    }

    clear() {
        this.stack = [];
        this.pointer = -1;
    }
}
