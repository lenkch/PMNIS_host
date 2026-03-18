/**
 * Crop tool: interactive rectangle selection on an overlay canvas.
 */
export class CropTool {
    constructor(editor) {
        this.editor = editor;
        this.active = false;
        this.startX = 0;
        this.startY = 0;
        this.endX = 0;
        this.endY = 0;
        this.dragging = false;

        this.overlay = document.getElementById('crop-overlay');
        this.overlayCtx = this.overlay.getContext('2d');

        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
    }

    /**
     * Activate crop mode.
     */
    activate() {
        this.active = true;
        this.overlay.style.display = 'block';
        this._syncOverlaySize();
        this.overlay.addEventListener('mousedown', this._onMouseDown);
        this.overlay.addEventListener('mousemove', this._onMouseMove);
        this.overlay.addEventListener('mouseup', this._onMouseUp);
        document.getElementById('crop-actions').style.display = 'flex';
    }

    /**
     * Deactivate crop mode.
     */
    deactivate() {
        this.active = false;
        this.dragging = false;
        this.overlay.style.display = 'none';
        this.overlay.removeEventListener('mousedown', this._onMouseDown);
        this.overlay.removeEventListener('mousemove', this._onMouseMove);
        this.overlay.removeEventListener('mouseup', this._onMouseUp);
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        document.getElementById('crop-actions').style.display = 'none';
    }

    _syncOverlaySize() {
        const canvas = this.editor.canvas;
        this.overlay.width = canvas.width;
        this.overlay.height = canvas.height;
        // Let CSS max-width/max-height handle the displayed size
        this.overlay.style.width = '';
        this.overlay.style.height = '';
    }

    _getCanvasCoords(e) {
        const rect = this.overlay.getBoundingClientRect();
        const scaleX = this.overlay.width / rect.width;
        const scaleY = this.overlay.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    _onMouseDown(e) {
        const coords = this._getCanvasCoords(e);
        this.startX = coords.x;
        this.startY = coords.y;
        this.endX = coords.x;
        this.endY = coords.y;
        this.dragging = true;
    }

    _onMouseMove(e) {
        if (!this.dragging) return;
        const coords = this._getCanvasCoords(e);
        this.endX = coords.x;
        this.endY = coords.y;
        this._drawSelection();
    }

    _onMouseUp(e) {
        if (!this.dragging) return;
        const coords = this._getCanvasCoords(e);
        this.endX = coords.x;
        this.endY = coords.y;
        this.dragging = false;
        this._drawSelection();
    }

    _drawSelection() {
        const ctx = this.overlayCtx;
        const w = this.overlay.width;
        const h = this.overlay.height;

        ctx.clearRect(0, 0, w, h);

        // Dim the area outside the selection
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, w, h);

        // Clear the selected region
        const x = Math.min(this.startX, this.endX);
        const y = Math.min(this.startY, this.endY);
        const selW = Math.abs(this.endX - this.startX);
        const selH = Math.abs(this.endY - this.startY);

        ctx.clearRect(x, y, selW, selH);

        // Draw border around selection
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x, y, selW, selH);
        ctx.setLineDash([]);
    }

    /**
     * Get the selected crop bounds.
     */
    getBounds() {
        return {
            x: Math.round(Math.min(this.startX, this.endX)),
            y: Math.round(Math.min(this.startY, this.endY)),
            width: Math.round(Math.abs(this.endX - this.startX)),
            height: Math.round(Math.abs(this.endY - this.startY))
        };
    }

    /**
     * Apply the crop to the editor.
     */
    applyCrop() {
        const bounds = this.getBounds();
        if (bounds.width < 2 || bounds.height < 2) {
            this.deactivate();
            return;
        }
        this.editor.crop(bounds);
        this.deactivate();
    }
}
