/**
 * Annotation module for the photo editor.
 * Supports: freehand drawing, arrows, rectangles, ellipses, text labels, and markers.
 * Annotations are rendered on a separate overlay canvas so they don't
 * destroy the underlying image data.
 * Includes selection/editing of individual annotations and simulated AI object detection.
 */

// Predefined annotation colors
export const ANNOTATION_COLORS = [
    { id: 'red', label: 'Red', color: '#e94560' },
    { id: 'orange', label: 'Orange', color: '#ff9f43' },
    { id: 'yellow', label: 'Yellow', color: '#feca57' },
    { id: 'green', label: 'Green', color: '#10ac84' },
    { id: 'blue', label: 'Blue', color: '#58a6ff' },
    { id: 'purple', label: 'Purple', color: '#c44dff' },
    { id: 'white', label: 'White', color: '#e6edf3' },
    { id: 'gray', label: 'Gray', color: '#8b949e' },
];

export const ANNOTATION_TOOLS = {
    FREEHAND: 'freehand',
    RECTANGLE: 'rectangle',
    ELLIPSE: 'ellipse',
    ARROW: 'arrow',
    TEXT: 'text',
    MARKER: 'marker',
    SELECT: 'select',
};

let _nextId = 1;

export class AnnotationLayer {
    constructor(overlayCanvas, editorCanvas) {
        this.overlay = overlayCanvas;
        this.ctx = this.overlay.getContext('2d');
        this.editorCanvas = editorCanvas;
        this.annotations = [];
        this.currentTool = ANNOTATION_TOOLS.RECTANGLE;
        this.currentColor = ANNOTATION_COLORS[0];
        this.lineWidth = 3;
        this.fontSize = 16;
        this.active = false;
        this.drawing = false;
        this.currentPath = [];
        this.startPoint = null;
        this.selectedId = null;


        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onChangeCallbacks = [];
    }

    onChange(cb) {
        this._onChangeCallbacks.push(cb);
    }

    _notifyChange() {
        this._onChangeCallbacks.forEach(cb => cb());
    }

    /**
     * Sync the overlay canvas size to match the editor canvas.
     */
    syncSize() {
        this.overlay.width = this.editorCanvas.width;
        this.overlay.height = this.editorCanvas.height;
        // Don't force inline width/height — let CSS max-width/max-height
        // handle the displayed size so the overlay aligns with the editor canvas.
        this.overlay.style.width = '';
        this.overlay.style.height = '';
        this.redraw();
    }

    /**
     * Activate annotation mode.
     */
    activate() {
        this.active = true;
        this.overlay.style.display = 'block';
        this.overlay.style.pointerEvents = 'auto';
        this.syncSize();
        this.overlay.addEventListener('mousedown', this._onMouseDown);
        this.overlay.addEventListener('mousemove', this._onMouseMove);
        this.overlay.addEventListener('mouseup', this._onMouseUp);
        this._updateCursor();
    }

    /**
     * Deactivate annotation mode (annotations remain visible).
     */
    deactivate() {
        this.active = false;
        this.drawing = false;
        this.overlay.style.pointerEvents = 'none';
        this.overlay.removeEventListener('mousedown', this._onMouseDown);
        this.overlay.removeEventListener('mousemove', this._onMouseMove);
        this.overlay.removeEventListener('mouseup', this._onMouseUp);
        this.overlay.style.cursor = 'default';
    }

    _updateCursor() {
        if (this.currentTool === ANNOTATION_TOOLS.TEXT) {
            this.overlay.style.cursor = 'text';
        } else if (this.currentTool === ANNOTATION_TOOLS.SELECT) {
            this.overlay.style.cursor = 'pointer';
        } else {
            this.overlay.style.cursor = 'crosshair';
        }
    }

    setTool(tool) {
        this.currentTool = tool;
        if (this.active) this._updateCursor();
    }

    setColor(colorId) {
        const c = ANNOTATION_COLORS.find(c => c.id === colorId);
        if (c) this.currentColor = c;
    }

    setLineWidth(w) {
        this.lineWidth = w;
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

    // ---- Hit testing for select tool ----

    _hitTest(x, y) {
        // Walk annotations in reverse so topmost is selected first
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];
            if (ann.hidden) continue;
            if (this._pointInAnnotation(ann, x, y)) {
                return ann.id;
            }
        }
        return null;
    }

    _pointInAnnotation(ann, x, y) {
        const margin = 8;
        switch (ann.type) {
            case ANNOTATION_TOOLS.RECTANGLE:
                return x >= ann.x - margin && x <= ann.x + ann.width + margin &&
                       y >= ann.y - margin && y <= ann.y + ann.height + margin;
            case ANNOTATION_TOOLS.ELLIPSE: {
                const dx = (x - ann.cx) / (ann.rx + margin);
                const dy = (y - ann.cy) / (ann.ry + margin);
                return dx * dx + dy * dy <= 1;
            }
            case ANNOTATION_TOOLS.MARKER: {
                const dist = Math.hypot(x - ann.x, y - ann.y);
                return dist <= ann.radius + margin;
            }
            case ANNOTATION_TOOLS.TEXT: {
                // Approximate text bounding box
                const tw = ann.text.length * ann.fontSize * 0.6;
                const th = ann.fontSize;
                return x >= ann.x - margin && x <= ann.x + tw + margin &&
                       y >= ann.y - th - margin && y <= ann.y + margin;
            }
            case ANNOTATION_TOOLS.ARROW: {
                // Check distance to the line segment
                const d = this._distToSegment(x, y, ann.fromX, ann.fromY, ann.toX, ann.toY);
                return d <= margin + ann.lineWidth;
            }
            case ANNOTATION_TOOLS.FREEHAND: {
                if (!ann.path || ann.path.length < 2) return false;
                for (let j = 0; j < ann.path.length - 1; j++) {
                    const d = this._distToSegment(x, y, ann.path[j].x, ann.path[j].y, ann.path[j+1].x, ann.path[j+1].y);
                    if (d <= margin + ann.lineWidth) return true;
                }
                return false;
            }
            default:
                return false;
        }
    }

    _distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // ---- Mouse event handlers ----

    _onMouseDown(e) {
        const coords = this._getCanvasCoords(e);

        // Select tool
        if (this.currentTool === ANNOTATION_TOOLS.SELECT) {
            const hitId = this._hitTest(coords.x, coords.y);
            this.selectAnnotation(hitId);
            return;
        }

        if (this.currentTool === ANNOTATION_TOOLS.TEXT) {
            const text = prompt('Enter label:');
            if (text && text.trim()) {
                this.annotations.push({
                    id: _nextId++,
                    type: ANNOTATION_TOOLS.TEXT,
                    color: this.currentColor.color,
                    label: text.trim(),
                    x: coords.x,
                    y: coords.y,
                    text: text.trim(),
                    fontSize: this.fontSize,
                });
                this.redraw();
                this._notifyChange();
            }
            return;
        }

        this.drawing = true;
        this.startPoint = coords;

        if (this.currentTool === ANNOTATION_TOOLS.FREEHAND) {
            this.currentPath = [coords];
        }
    }

    _onMouseMove(e) {
        const coords = this._getCanvasCoords(e);

        if (!this.drawing) return;

        if (this.currentTool === ANNOTATION_TOOLS.FREEHAND) {
            this.currentPath.push(coords);
        }

        this.redraw();
        this._drawPreview(coords);
    }

    _onMouseUp(e) {

        if (!this.drawing) return;
        const coords = this._getCanvasCoords(e);
        this.drawing = false;

        const annotation = {
            id: _nextId++,
            type: this.currentTool,
            color: this.currentColor.color,
            label: this.currentTool.charAt(0).toUpperCase() + this.currentTool.slice(1),
            lineWidth: this.lineWidth,
        };

        switch (this.currentTool) {
            case ANNOTATION_TOOLS.FREEHAND:
                this.currentPath.push(coords);
                annotation.path = [...this.currentPath];
                annotation.label = 'Freehand';
                break;
            case ANNOTATION_TOOLS.RECTANGLE:
                annotation.x = Math.min(this.startPoint.x, coords.x);
                annotation.y = Math.min(this.startPoint.y, coords.y);
                annotation.width = Math.abs(coords.x - this.startPoint.x);
                annotation.height = Math.abs(coords.y - this.startPoint.y);
                annotation.label = 'Rectangle';
                break;
            case ANNOTATION_TOOLS.ELLIPSE:
                annotation.cx = (this.startPoint.x + coords.x) / 2;
                annotation.cy = (this.startPoint.y + coords.y) / 2;
                annotation.rx = Math.abs(coords.x - this.startPoint.x) / 2;
                annotation.ry = Math.abs(coords.y - this.startPoint.y) / 2;
                annotation.label = 'Ellipse';
                break;
            case ANNOTATION_TOOLS.ARROW:
                annotation.fromX = this.startPoint.x;
                annotation.fromY = this.startPoint.y;
                annotation.toX = coords.x;
                annotation.toY = coords.y;
                annotation.label = 'Arrow';
                break;
            case ANNOTATION_TOOLS.MARKER:
                annotation.x = this.startPoint.x;
                annotation.y = this.startPoint.y;
                annotation.radius = Math.max(Math.hypot(coords.x - this.startPoint.x, coords.y - this.startPoint.y), 8);
                annotation.label = 'Marker';
                break;
        }

        this.annotations.push(annotation);
        this.currentPath = [];
        this.startPoint = null;
        this.redraw();
        this._notifyChange();
    }

    _drawPreview(coords) {
        const ctx = this.ctx;
        const color = this.currentColor.color;
        ctx.strokeStyle = color;
        ctx.lineWidth = this.lineWidth;
        ctx.setLineDash([]);

        switch (this.currentTool) {
            case ANNOTATION_TOOLS.FREEHAND:
                this._drawPath(ctx, this.currentPath, color, this.lineWidth);
                break;
            case ANNOTATION_TOOLS.RECTANGLE: {
                const x = Math.min(this.startPoint.x, coords.x);
                const y = Math.min(this.startPoint.y, coords.y);
                const w = Math.abs(coords.x - this.startPoint.x);
                const h = Math.abs(coords.y - this.startPoint.y);
                ctx.setLineDash([6, 3]);
                ctx.strokeRect(x, y, w, h);
                ctx.setLineDash([]);
                break;
            }
            case ANNOTATION_TOOLS.ELLIPSE: {
                const cx = (this.startPoint.x + coords.x) / 2;
                const cy = (this.startPoint.y + coords.y) / 2;
                const rx = Math.abs(coords.x - this.startPoint.x) / 2;
                const ry = Math.abs(coords.y - this.startPoint.y) / 2;
                ctx.setLineDash([6, 3]);
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                break;
            }
            case ANNOTATION_TOOLS.ARROW:
                this._drawArrow(ctx, this.startPoint.x, this.startPoint.y, coords.x, coords.y, color, this.lineWidth);
                break;
            case ANNOTATION_TOOLS.MARKER: {
                const r = Math.max(Math.hypot(coords.x - this.startPoint.x, coords.y - this.startPoint.y), 8);
                ctx.beginPath();
                ctx.arc(this.startPoint.x, this.startPoint.y, r, 0, Math.PI * 2);
                ctx.fillStyle = color + '33';
                ctx.fill();
                ctx.stroke();
                break;
            }
        }
    }

    // ---- Selection ----

    selectAnnotation(id) {
        this.selectedId = id;
        this.redraw();
        this._notifyChange();
    }

    deleteSelected() {
        if (this.selectedId === null) return;
        const ann = this.annotations.find(a => a.id === this.selectedId);
        if (ann) { ann.hidden = true; }
        this.selectedId = null;
        this.redraw();
        this._notifyChange();
    }

    deleteAnnotation(id) {
        const ann = this.annotations.find(a => a.id === id);
        if (ann) { ann.hidden = true; }
        if (this.selectedId === id) this.selectedId = null;
        this.redraw();
        this._notifyChange();
    }

    restoreAnnotation(id) {
        const ann = this.annotations.find(a => a.id === id);
        if (ann) { ann.hidden = false; }
        this.redraw();
        this._notifyChange();
    }

    /**
     * Erase the image region covered by an annotation from the editor canvas.
     * Fills the bounding box with a heavily blurred copy of its surroundings,
     * then hides the annotation marker.
     */
    eraseObject(id, editorCanvas) {
        const ann = this.annotations.find(a => a.id === id);
        if (!ann) return;

        const ctx = editorCanvas.getContext('2d');
        const W = editorCanvas.width;
        const H = editorCanvas.height;

        // Compute bounding box from annotation geometry
        let bx, by, bw, bh;
        const pad = 4;
        switch (ann.type) {
            case ANNOTATION_TOOLS.RECTANGLE:
                bx = ann.x - pad; by = ann.y - pad;
                bw = ann.width + pad * 2; bh = ann.height + pad * 2;
                break;
            case ANNOTATION_TOOLS.ELLIPSE:
                bx = ann.cx - ann.rx - pad; by = ann.cy - ann.ry - pad;
                bw = ann.rx * 2 + pad * 2; bh = ann.ry * 2 + pad * 2;
                break;
            case ANNOTATION_TOOLS.MARKER:
                bx = ann.x - ann.radius - pad; by = ann.y - ann.radius - pad;
                bw = ann.radius * 2 + pad * 2; bh = ann.radius * 2 + pad * 2;
                break;
            case ANNOTATION_TOOLS.FREEHAND: {
                const xs = ann.path.map(p => p.x);
                const ys = ann.path.map(p => p.y);
                bx = Math.min(...xs) - pad; by = Math.min(...ys) - pad;
                bw = Math.max(...xs) - bx + pad; bh = Math.max(...ys) - by + pad;
                break;
            }
            case ANNOTATION_TOOLS.ARROW:
                bx = Math.min(ann.fromX, ann.toX) - pad; by = Math.min(ann.fromY, ann.toY) - pad;
                bw = Math.abs(ann.toX - ann.fromX) + pad * 2; bh = Math.abs(ann.toY - ann.fromY) + pad * 2;
                break;
            default:
                // TEXT or unknown — just hide the annotation
                ann.hidden = true;
                this.redraw(); this._notifyChange(); return;
        }

        // Clamp to canvas bounds
        bx = Math.max(0, Math.round(bx));
        by = Math.max(0, Math.round(by));
        bw = Math.min(W - bx, Math.round(bw));
        bh = Math.min(H - by, Math.round(bh));
        if (bw <= 0 || bh <= 0) { ann.hidden = true; this.redraw(); this._notifyChange(); return; }

        // Sample a border ring around the region to get fill colors
        const borderSize = Math.max(6, Math.round(Math.min(bw, bh) * 0.12));
        const sampleX = Math.max(0, bx - borderSize);
        const sampleY = Math.max(0, by - borderSize);
        const sampleW = Math.min(W - sampleX, bw + borderSize * 2);
        const sampleH = Math.min(H - sampleY, bh + borderSize * 2);

        const imgData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
        const d = imgData.data;

        // Average the border pixels (exclude the inner rect)
        let r = 0, g = 0, b = 0, n = 0;
        for (let py = 0; py < sampleH; py++) {
            for (let px = 0; px < sampleW; px++) {
                const absX = sampleX + px, absY = sampleY + py;
                // Only count pixels outside the erase region
                if (absX >= bx && absX < bx + bw && absY >= by && absY < by + bh) continue;
                const i = (py * sampleW + px) * 4;
                r += d[i]; g += d[i+1]; b += d[i+2]; n++;
            }
        }
        if (n === 0) { r = 128; g = 128; b = 128; } else { r /= n; g /= n; b /= n; }

        // Fill the region with the averaged color
        ctx.save();
        ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
        ctx.fillRect(bx, by, bw, bh);

        // Apply a simple box blur pass over the region to blend edges
        const blurPad = Math.min(12, Math.round(Math.min(bw, bh) * 0.2));
        const blurX = Math.max(0, bx - blurPad);
        const blurY = Math.max(0, by - blurPad);
        const blurW = Math.min(W - blurX, bw + blurPad * 2);
        const blurH = Math.min(H - blurY, bh + blurPad * 2);

        // Draw blurred version of the filled area back using drawImage scale trick
        const tmp = document.createElement('canvas');
        const scale = 8;
        tmp.width  = Math.max(1, Math.round(blurW / scale));
        tmp.height = Math.max(1, Math.round(blurH / scale));
        const tCtx = tmp.getContext('2d');
        tCtx.drawImage(editorCanvas, blurX, blurY, blurW, blurH, 0, 0, tmp.width, tmp.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, blurX, blurY, blurW, blurH);

        ctx.restore();

        // Hide annotation and notify
        ann.hidden = true;
        this.redraw();
        this._notifyChange();
    }

    renameAnnotation(id, newLabel) {
        const ann = this.annotations.find(a => a.id === id);
        if (ann) {
            ann.label = newLabel;
            this.redraw();
            this._notifyChange();
        }
    }

    /**
     * Redraw all saved annotations.
     */
    redraw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

        for (const ann of this.annotations) {
            if (ann.hidden) continue;
            const color = ann.color;
            const isSelected = ann.id === this.selectedId;
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = ann.lineWidth || this.lineWidth;
            ctx.setLineDash([]);

            switch (ann.type) {
                case ANNOTATION_TOOLS.FREEHAND:
                    this._drawPath(ctx, ann.path, color, ann.lineWidth);
                    break;
                case ANNOTATION_TOOLS.RECTANGLE:
                    ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
                    ctx.fillStyle = color + '1A';
                    ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
                    if (ann.label) this._drawLabel(ctx, ann.label, ann.x, ann.y - 4, color);
                    break;
                case ANNOTATION_TOOLS.ELLIPSE:
                    ctx.beginPath();
                    ctx.ellipse(ann.cx, ann.cy, ann.rx, ann.ry, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = color + '1A';
                    ctx.fill();
                    if (ann.label) this._drawLabel(ctx, ann.label, ann.cx - ann.rx, ann.cy - ann.ry - 4, color);
                    break;
                case ANNOTATION_TOOLS.ARROW:
                    this._drawArrow(ctx, ann.fromX, ann.fromY, ann.toX, ann.toY, color, ann.lineWidth);
                    break;
                case ANNOTATION_TOOLS.TEXT:
                    ctx.font = `bold ${ann.fontSize}px 'Segoe UI', system-ui, sans-serif`;
                    ctx.fillStyle = color;
                    ctx.shadowColor = 'rgba(0,0,0,0.7)';
                    ctx.shadowBlur = 3;
                    ctx.fillText(ann.text, ann.x, ann.y);
                    ctx.shadowBlur = 0;
                    break;
                case ANNOTATION_TOOLS.MARKER:
                    ctx.beginPath();
                    ctx.arc(ann.x, ann.y, ann.radius, 0, Math.PI * 2);
                    ctx.fillStyle = color + '33';
                    ctx.fill();
                    ctx.stroke();
                    if (ann.label) this._drawLabel(ctx, ann.label, ann.x + ann.radius + 4, ann.y, color);
                    break;
            }

            // Draw selection highlight
            if (isSelected) {
                this._drawSelectionHighlight(ctx, ann);
            }
        }
    }

    _drawSelectionHighlight(ctx, ann) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);

        switch (ann.type) {
            case ANNOTATION_TOOLS.RECTANGLE:
                ctx.strokeRect(ann.x - 4, ann.y - 4, ann.width + 8, ann.height + 8);
                break;
            case ANNOTATION_TOOLS.ELLIPSE:
                ctx.beginPath();
                ctx.ellipse(ann.cx, ann.cy, ann.rx + 4, ann.ry + 4, 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case ANNOTATION_TOOLS.MARKER:
                ctx.beginPath();
                ctx.arc(ann.x, ann.y, ann.radius + 4, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case ANNOTATION_TOOLS.FREEHAND: {
                if (!ann.path || ann.path.length === 0) break;
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const p of ann.path) {
                    if (p.x < minX) minX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y > maxY) maxY = p.y;
                }
                ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
                break;
            }
            case ANNOTATION_TOOLS.ARROW:
                ctx.strokeRect(
                    Math.min(ann.fromX, ann.toX) - 4,
                    Math.min(ann.fromY, ann.toY) - 4,
                    Math.abs(ann.toX - ann.fromX) + 8,
                    Math.abs(ann.toY - ann.fromY) + 8
                );
                break;
            case ANNOTATION_TOOLS.TEXT: {
                const tw = ann.text.length * ann.fontSize * 0.6;
                ctx.strokeRect(ann.x - 2, ann.y - ann.fontSize - 2, tw + 4, ann.fontSize + 6);
                break;
            }
        }
        ctx.restore();
    }

    _drawPath(ctx, path, color, width) {
        if (path.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
    }

    _drawArrow(ctx, fromX, fromY, toX, toY, color, width) {
        const headLen = 12 + width * 2;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    _drawLabel(ctx, text, x, y, color) {
        ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
        const metrics = ctx.measureText(text);
        const pad = 3;
        const bgX = x - pad;
        const bgY = y - 12;
        const bgW = metrics.width + pad * 2;
        const bgH = 15;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(bgX, bgY, bgW, bgH);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
    }

    /**
     * Remove the last annotation.
     */
    undoLast() {
        if (this.annotations.length === 0) return;
        this.annotations.pop();
        this.selectedId = null;
        this.redraw();
        this._notifyChange();
    }

    /**
     * Clear all annotations.
     */
    clearAll() {
        this.annotations = [];
        this.selectedId = null;
        this.redraw();
        this._notifyChange();
    }

    /**
     * Export annotations as JSON.
     */
    exportAnnotations() {
        return JSON.stringify(this.annotations, null, 2);
    }

    /**
     * Import annotations from JSON.
     */
    importAnnotations(json) {
        try {
            this.annotations = JSON.parse(json);
            this.redraw();
            this._notifyChange();
        } catch (e) {
            console.error('Failed to import annotations:', e);
        }
    }

    /**
     * Simulated AI object detection.
     * Analyzes the image and generates bounding-box annotations for "detected objects".
     * This uses simple edge/contrast detection as a placeholder for a real AI model.
     */
    aiDetectObjects(editorCanvas) {
        const w = editorCanvas.width;
        const h = editorCanvas.height;
        const ctx = editorCanvas.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        // Simple region-based detection: divide image into grid,
        // find cells with high contrast (edges) and cluster them.
        const cellSize = Math.max(20, Math.floor(Math.min(w, h) / 16));
        const cols = Math.ceil(w / cellSize);
        const rows = Math.ceil(h / cellSize);
        const grid = [];

        for (let r = 0; r < rows; r++) {
            grid[r] = [];
            for (let c = 0; c < cols; c++) {
                let totalVariance = 0;
                let count = 0;
                let sumR = 0, sumG = 0, sumB = 0;
                const x0 = c * cellSize;
                const y0 = r * cellSize;
                const x1 = Math.min(x0 + cellSize, w);
                const y1 = Math.min(y0 + cellSize, h);
                const samples = [];

                for (let y = y0; y < y1; y += 2) {
                    for (let x = x0; x < x1; x += 2) {
                        const idx = (y * w + x) * 4;
                        const brightness = data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;
                        samples.push(brightness);
                        sumR += data[idx];
                        sumG += data[idx+1];
                        sumB += data[idx+2];
                        count++;
                    }
                }

                if (count > 0) {
                    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
                    totalVariance = samples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / samples.length;
                }

                grid[r][c] = {
                    variance: totalVariance,
                    avgR: count > 0 ? sumR / count : 0,
                    avgG: count > 0 ? sumG / count : 0,
                    avgB: count > 0 ? sumB / count : 0,
                };
            }
        }

        // Find variance threshold (high-interest regions)
        const allVariances = grid.flat().map(c => c.variance).sort((a, b) => a - b);
        const threshold = allVariances[Math.floor(allVariances.length * 0.75)];

        // Flood-fill connected high-contrast cells into regions
        const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
        const regions = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (visited[r][c] || grid[r][c].variance < threshold) continue;
                // BFS
                const queue = [[r, c]];
                visited[r][c] = true;
                let minR = r, maxR = r, minC = c, maxC = c;
                let cellCount = 0;
                while (queue.length > 0) {
                    const [cr, cc] = queue.shift();
                    cellCount++;
                    minR = Math.min(minR, cr);
                    maxR = Math.max(maxR, cr);
                    minC = Math.min(minC, cc);
                    maxC = Math.max(maxC, cc);
                    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                        const nr = cr + dr, nc = cc + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc] && grid[nr][nc].variance >= threshold) {
                            visited[nr][nc] = true;
                            queue.push([nr, nc]);
                        }
                    }
                }
                // Only keep regions of meaningful size
                if (cellCount >= 3) {
                    regions.push({ minR, maxR, minC, maxC, cellCount });
                }
            }
        }

        // Merge overlapping/close regions and limit to top N
        const detectedColors = ['#e94560', '#ff9f43', '#58a6ff', '#10ac84', '#c44dff', '#feca57'];
        const sorted = regions.sort((a, b) => b.cellCount - a.cellCount).slice(0, 8);

        const newAnnotations = sorted.map((region, i) => {
            const x = region.minC * cellSize;
            const y = region.minR * cellSize;
            const rw = (region.maxC - region.minC + 1) * cellSize;
            const rh = (region.maxR - region.minR + 1) * cellSize;
            return {
                id: _nextId++,
                type: ANNOTATION_TOOLS.RECTANGLE,
                color: detectedColors[i % detectedColors.length],
                label: `Object ${i + 1}`,
                lineWidth: 2,
                x: Math.max(0, x - 4),
                y: Math.max(0, y - 4),
                width: Math.min(rw + 8, w - x),
                height: Math.min(rh + 8, h - y),
                aiGenerated: true,
            };
        });

        this.annotations.push(...newAnnotations);
        this.redraw();
        this._notifyChange();

        return newAnnotations.length;
    }

    /**
     * Flatten annotations onto the editor canvas for export.
     */
    flattenOnto(editorCanvas) {
        const merged = document.createElement('canvas');
        merged.width = editorCanvas.width;
        merged.height = editorCanvas.height;
        const mCtx = merged.getContext('2d');
        mCtx.drawImage(editorCanvas, 0, 0);
        mCtx.drawImage(this.overlay, 0, 0);
        return merged;
    }

    /**
     * Get annotation count.
     */
    get count() {
        return this.annotations.filter(a => !a.hidden).length;
    }
}
