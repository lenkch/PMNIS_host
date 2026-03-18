/**
 * App bootstrap: wires UI events to the Editor API and Annotation Layer.
 */
import { Editor } from './editor.js';
import { CropTool } from './crop.js';
import { AnnotationLayer } from './annotations.js';
import { applyBrightness, applyContrast, applySaturation } from './adjustments.js';
import { grayscale, sepia, invert, blur } from './filters.js';
import { rotateCW, rotateCCW, flipH, flipV } from './transform.js';
import { downloadDataURL, debounce } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================
    // WELCOME / ROLE SCREEN
    // =========================================================
    const welcomeScreen = document.getElementById('welcome-screen');
    let currentRole = 'pro';
    let tipsDisabled = false;
    let tipPendingAction = null;

    // Per-action tips (still used for on-click tips if tour was skipped)
    const TIPS = {
        'btn-grayscale': { title: '🖤 Grayscale',               text: 'Removes all colour from your image, turning it black & white.' },
        'btn-sepia':     { title: '🟤 Sepia',                   text: 'Adds a warm brownish tone — great for a vintage look.' },
        'btn-invert':    { title: '🔄 Invert',                  text: 'Flips every colour to its opposite — like a photo negative.' },
        'btn-blur':      { title: '💧 Blur',                    text: 'Softens the image by smoothing out fine details.' },
        'btn-rotate-cw': { title: '↻ Rotate Clockwise',         text: 'Turns the image 90° to the right.' },
        'btn-rotate-ccw':{ title: '↺ Rotate Counter-Clockwise', text: 'Turns the image 90° to the left.' },
        'btn-flip-h':    { title: '⇔ Flip Horizontal',          text: 'Mirrors the image left-to-right.' },
        'btn-flip-v':    { title: '⇕ Flip Vertical',            text: 'Mirrors the image upside-down.' },
        'btn-crop':      { title: '✂️ Crop',                    text: 'Draw a rectangle on the image to keep only that area.' },
        'btn-undo':      { title: '↩️ Undo',                    text: 'Steps back to the previous state. You can undo multiple times.' },
        'btn-redo':      { title: '↪️ Redo',                    text: 'Re-applies a change you just undid.' },
        'btn-reset':     { title: '🔄 Reset',                   text: 'Reverts the image all the way back to the original you opened.' },
        'btn-download':  { title: '💾 Save',                    text: 'Downloads the edited image to your computer as a PNG file.' },
        'brightness':    { title: '☀️ Brightness',              text: 'Drag right to make the image lighter, left to make it darker.' },
        'contrast':      { title: '◑ Contrast',                 text: 'Drag right to make dark and light areas more distinct.' },
        'saturation':    { title: '🎨 Saturation',              text: 'Drag right for more vivid colours, left to wash them out.' },
    };

    // ---- Guided tour definition (shown sequentially after image upload) ----
    const TOUR_STEPS = [
        { targetId: 'adjustments-panel',  title: '🎨 Adjustments',        text: 'Use these sliders to change the brightness, contrast and saturation of your photo. Drag left or right to see the effect live.' },
        { targetId: 'btn-grayscale',      title: '✨ Filters',             text: 'Filters instantly change the look of your image. Try Grayscale for black & white, Sepia for vintage, Invert for a negative effect, or Blur to soften.' },
        { targetId: 'btn-undo',           title: '↩️ Undo & Redo',         text: 'Made a mistake? Hit Undo to step back. Use Redo to bring it back. You can undo as many steps as you need.' },
        { targetId: 'btn-rotate-cw',      title: '🔄 Transform',           text: 'Rotate or flip your image here. Great for fixing photos taken at the wrong angle.' },
        { targetId: 'btn-crop',           title: '✂️ Crop',                text: 'Click Crop, then drag a rectangle on your image to keep only the area you want.' },
        { targetId: 'btn-reset',          title: '🔄 Reset',               text: 'Changed your mind about everything? Reset brings your photo back to exactly how you opened it.' },
        { targetId: 'btn-download',       title: '💾 Save',                text: 'When you\'re happy with the result, click Save to download your edited photo as a PNG.' },
    ];

    // Build the guided tour popup
    const tourOverlay = document.createElement('div');
    tourOverlay.className = 'tour-overlay hidden';
    tourOverlay.innerHTML = `
        <div class="tour-popup">
            <div class="tour-header">
                <span class="tour-badge">👋 Quick Tour</span>
                <span class="tour-step-counter" id="tour-counter">1 / ${TOUR_STEPS.length}</span>
            </div>
            <div class="tour-title" id="tour-title"></div>
            <p class="tour-text" id="tour-text"></p>
            <div class="tour-progress">
                <div class="tour-progress-bar" id="tour-progress-bar"></div>
            </div>
            <div class="tour-actions">
                <button class="btn" id="tour-skip">Skip tour</button>
                <div class="tour-nav">
                    <button class="btn" id="tour-back">← Back</button>
                    <button class="btn btn-primary" id="tour-next">Next →</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(tourOverlay);

    let tourStep = 0;
    let tourHighlightEl = null;
    let tourDone = false;

    function highlightEl(id) {
        // Remove previous highlight
        if (tourHighlightEl) tourHighlightEl.classList.remove('tour-highlight');
        const el = id ? document.getElementById(id) : null;
        if (el) {
            el.classList.add('tour-highlight');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        tourHighlightEl = el;
    }

    function positionTourPopup(targetId) {
        const popup = tourOverlay.querySelector('.tour-popup');
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) { popup.style.top = '50%'; popup.style.left = '50%'; popup.style.transform = 'translate(-50%,-50%)'; return; }

        const rect = target.getBoundingClientRect();
        const pw = 340, ph = 220;
        const spaceRight  = window.innerWidth  - rect.right;
        const spaceBottom = window.innerHeight - rect.bottom;

        popup.style.transform = '';
        if (spaceRight >= pw + 16) {
            popup.style.left = (rect.right + 12) + 'px';
            popup.style.top  = Math.min(rect.top, window.innerHeight - ph - 12) + 'px';
        } else if (spaceBottom >= ph + 16) {
            popup.style.left = Math.min(rect.left, window.innerWidth - pw - 12) + 'px';
            popup.style.top  = (rect.bottom + 12) + 'px';
        } else {
            popup.style.left = Math.min(rect.left, window.innerWidth - pw - 12) + 'px';
            popup.style.top  = Math.max(12, rect.top - ph - 12) + 'px';
        }
    }

    function showTourStep(index) {
        const step = TOUR_STEPS[index];
        document.getElementById('tour-title').textContent   = step.title;
        document.getElementById('tour-text').textContent    = step.text;
        document.getElementById('tour-counter').textContent = `${index + 1} / ${TOUR_STEPS.length}`;
        document.getElementById('tour-progress-bar').style.width = `${((index + 1) / TOUR_STEPS.length) * 100}%`;
        document.getElementById('tour-back').style.visibility = index === 0 ? 'hidden' : 'visible';
        document.getElementById('tour-next').textContent = index === TOUR_STEPS.length - 1 ? 'Finish ✓' : 'Next →';

        tourOverlay.classList.remove('hidden');
        highlightEl(step.targetId);
        positionTourPopup(step.targetId);
    }

    function endTour() {
        tourOverlay.classList.add('hidden');
        if (tourHighlightEl) { tourHighlightEl.classList.remove('tour-highlight'); tourHighlightEl = null; }
        tourDone = true;
    }

    document.getElementById('tour-next').addEventListener('click', () => {
        if (tourStep < TOUR_STEPS.length - 1) { tourStep++; showTourStep(tourStep); }
        else endTour();
    });
    document.getElementById('tour-back').addEventListener('click', () => {
        if (tourStep > 0) { tourStep--; showTourStep(tourStep); }
    });
    document.getElementById('tour-skip').addEventListener('click', endTour);

    // ---- Per-action tip popup (still available on-click after tour) ----
    const tipOverlay = document.createElement('div');
    tipOverlay.className = 'onboarding-overlay hidden';
    tipOverlay.innerHTML = `
        <div class="onboarding-popup">
            <div class="onboarding-header">
                <span class="onboarding-title" id="tip-title"></span>
                <span class="onboarding-badge">💡 Tip</span>
            </div>
            <p class="onboarding-text" id="tip-text"></p>
            <div class="onboarding-actions">
                <button class="btn btn-primary" id="tip-got-it">Got it — continue</button>
                <button class="btn" id="tip-dismiss-all">Don't show tips anymore</button>
            </div>
        </div>`;
    document.body.appendChild(tipOverlay);

    function showTipPopup(title, text, onContinue) {
        document.getElementById('tip-title').textContent = title;
        document.getElementById('tip-text').textContent  = text;
        tipPendingAction = onContinue || null;
        tipOverlay.classList.remove('hidden');
    }

    document.getElementById('tip-got-it').addEventListener('click', () => {
        tipOverlay.classList.add('hidden');
        if (tipPendingAction) { tipPendingAction(); tipPendingAction = null; }
    });
    document.getElementById('tip-dismiss-all').addEventListener('click', () => {
        tipOverlay.classList.add('hidden');
        tipsDisabled = true;
        if (tipPendingAction) { tipPendingAction(); tipPendingAction = null; }
    });

    const seenTips = new Set();
    function withTip(id, action) {
        if (currentRole !== 'beginner' || tipsDisabled || seenTips.has(id) || !TIPS[id]) {
            action();
            return;
        }
        seenTips.add(id);
        showTipPopup(TIPS[id].title, TIPS[id].text, action);
    }

    function addSliderTip(sliderId) {
        const slider = document.getElementById(sliderId);
        if (!slider) return;
        let shown = false;
        slider.addEventListener('mousedown', () => {
            if (currentRole !== 'beginner' || tipsDisabled || shown || !TIPS[sliderId]) return;
            shown = true;
            seenTips.add(sliderId);
            showTipPopup(TIPS[sliderId].title, TIPS[sliderId].text, null);
        });
    }

    function dismissWelcome(role) {
        currentRole = role;
        welcomeScreen.style.animation = 'slideOut 0.25s ease forwards';
        setTimeout(() => {
            welcomeScreen.classList.add('hidden');
            document.getElementById('workspace').classList.add('visible');
            document.body.classList.add(`role-${role}`);
        }, 240);
    }

    document.getElementById('role-beginner').addEventListener('click', () => dismissWelcome('beginner'));
    document.getElementById('role-pro').addEventListener('click',      () => dismissWelcome('pro'));

    // ---- AI hover tooltip (shown on all roles, on hover over annotation tools) ----
    const aiTooltip = document.createElement('div');
    aiTooltip.className = 'ai-hover-tooltip hidden';
    aiTooltip.innerHTML = `
        <div class="ai-tooltip-header">Automatic Objects Detection</div>
        <div class="ai-tooltip-body">Try out automatic objects detection to fasten your work. You can review each detection, then you can decide to keep or delete them individually.</div>`;
    document.body.appendChild(aiTooltip);

    let tooltipHideTimer = null;

    function positionTooltip(targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const tooltipWidth = 300;
        const spaceRight = window.innerWidth - rect.right;

        if (spaceRight >= tooltipWidth + 12) {
            // Place to the right
            aiTooltip.style.top  = (rect.top + window.scrollY) + 'px';
            aiTooltip.style.left = (rect.right + 10 + window.scrollX) + 'px';
        } else {
            // Place below
            aiTooltip.style.top  = (rect.bottom + 8 + window.scrollY) + 'px';
            aiTooltip.style.left = Math.max(8, rect.left + window.scrollX) + 'px';
        }
    }

    function showAiTooltip(targetEl) {
        clearTimeout(tooltipHideTimer);
        positionTooltip(targetEl);
        aiTooltip.classList.remove('hidden');
    }

    function hideAiTooltip() {
        tooltipHideTimer = setTimeout(() => aiTooltip.classList.add('hidden'), 150);
    }

    // Attach to annotation panel header and the Annotate toolbar button
    setTimeout(() => {
        const targets = [
            document.getElementById('annotation-panel'),
            document.getElementById('annotation-panel-toggle'),
            document.getElementById('btn-annotate-toggle'),
            document.getElementById('toolbar-tool-icons'),
        ].filter(Boolean);

        targets.forEach(el => {
            el.addEventListener('mouseenter', () => showAiTooltip(el));
            el.addEventListener('mouseleave', hideAiTooltip);
        });
        aiTooltip.addEventListener('mouseenter', () => clearTimeout(tooltipHideTimer));
        aiTooltip.addEventListener('mouseleave', hideAiTooltip);
    }, 0);

    // =========================================================
    // CORE SETUP
    // =========================================================
    const canvas          = document.getElementById('editor-canvas');
    const annotationOverlay = document.getElementById('annotation-overlay');
    const editor          = new Editor(canvas);
    const cropTool        = new CropTool(editor);
    const annotationLayer = new AnnotationLayer(annotationOverlay, canvas);

    const dropZone        = document.getElementById('drop-zone');
    const fileInput       = document.getElementById('file-input');
    const uploadBtn       = document.getElementById('upload-btn');
    const workspace       = document.getElementById('workspace');
    const modeIndicator   = document.getElementById('mode-indicator');

    const brightnessSlider = document.getElementById('brightness');
    const contrastSlider   = document.getElementById('contrast');
    const saturationSlider = document.getElementById('saturation');
    const brightnessValue  = document.getElementById('brightness-value');
    const contrastValue    = document.getElementById('contrast-value');
    const saturationValue  = document.getElementById('saturation-value');

    const btnGrayscale  = document.getElementById('btn-grayscale');
    const btnSepia      = document.getElementById('btn-sepia');
    const btnInvert     = document.getElementById('btn-invert');
    const btnBlur       = document.getElementById('btn-blur');
    const btnRotateCW   = document.getElementById('btn-rotate-cw');
    const btnRotateCCW  = document.getElementById('btn-rotate-ccw');
    const btnFlipH      = document.getElementById('btn-flip-h');
    const btnFlipV      = document.getElementById('btn-flip-v');
    const btnCrop       = document.getElementById('btn-crop');
    const btnCropApply  = document.getElementById('btn-crop-apply');
    const btnCropCancel = document.getElementById('btn-crop-cancel');
    const btnUndo       = document.getElementById('btn-undo');
    const btnRedo       = document.getElementById('btn-redo');
    const btnDownload   = document.getElementById('btn-download');
    const btnReset      = document.getElementById('btn-reset');

    const btnAnnotateToggle    = document.getElementById('btn-annotate-toggle');
    const btnAiDetect          = document.getElementById('btn-ai-detect');
    const btnDeleteSelected    = document.getElementById('btn-delete-selected');
    const btnAnnotationClear   = document.getElementById('btn-annotation-clear');
    const btnExportAnnotations = document.getElementById('btn-export-annotations');
    const annotationWidthSlider= document.getElementById('annotation-width');
    const annotationWidthValue = document.getElementById('annotation-width-value');
    const toolButtons          = document.querySelectorAll('.tool-btn[data-tool]');
    const toolbarToolButtons   = document.querySelectorAll('.toolbar-tool-btn[data-tool]');
    const colorSwatches        = document.querySelectorAll('.color-swatch[data-color]');
    const annotationListEl     = document.getElementById('annotation-list');

    let annotationMode = false;

    // =========================================================
    // IMAGE UPLOAD
    // =========================================================
    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        editor.loadImage(file).then(() => {
            dropZone.style.display = 'none';
            workspace.classList.add('has-image');
            resetSliders();
            annotationLayer.syncSize();

            // Start guided tour for beginners (once only)
            if (currentRole === 'beginner' && !tourDone) {
                tourStep = 0;
                setTimeout(() => showTourStep(0), 400);
            }
        });
    }

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });
    dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    // =========================================================
    // SNACKBAR
    // =========================================================
    const snackbar = document.getElementById('snackbar');
    let snackbarTimer = null;
    function showSnackbar(message, duration = 3000) {
        snackbar.textContent = message;
        snackbar.classList.add('show');
        clearTimeout(snackbarTimer);
        snackbarTimer = setTimeout(() => snackbar.classList.remove('show'), duration);
    }

    // =========================================================
    // ANNOTATION MODE
    // =========================================================
    const btnEraseAllToolbar = document.getElementById('btn-erase-all');

    function toggleAnnotationMode() {
        if (!editor.imageLoaded) return;
        annotationMode = !annotationMode;
        const toolIcons = document.getElementById('toolbar-tool-icons');
        if (annotationMode) {
            annotationLayer.activate();
            btnAnnotateToggle.classList.add('active');
            modeIndicator.style.display = 'flex';
            toolIcons.classList.add('visible');
            btnEraseAllToolbar.style.display = '';
            document.body.classList.add('annotation-active');
        } else {
            annotationLayer.deactivate();
            btnAnnotateToggle.classList.remove('active');
            modeIndicator.style.display = 'none';
            toolIcons.classList.remove('visible');
            btnEraseAllToolbar.style.display = 'none';
            document.body.classList.remove('annotation-active');
        }
    }

    btnAnnotateToggle.addEventListener('click', toggleAnnotationMode);

    function selectTool(toolName) {
        toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === toolName));
        toolbarToolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === toolName));
        annotationLayer.setTool(toolName);
    }

    toolButtons.forEach(btn => btn.addEventListener('click', () => selectTool(btn.dataset.tool)));
    toolbarToolButtons.forEach(btn => btn.addEventListener('click', () => selectTool(btn.dataset.tool)));

    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            colorSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            annotationLayer.setColor(swatch.dataset.color);
        });
    });

    annotationWidthSlider.addEventListener('input', () => {
        annotationWidthValue.textContent = annotationWidthSlider.value;
        annotationLayer.setLineWidth(parseInt(annotationWidthSlider.value));
    });

    // =========================================================
    // ANNOTATION LIST
    // =========================================================
    function updateAnnotationList() {
        const annotations = annotationLayer.annotations;
        const selectedId  = annotationLayer.selectedId;

        if (annotations.length === 0) {
            annotationListEl.innerHTML = '<p class="list-empty">No annotations</p>';
            btnDeleteSelected.disabled = true;
            return;
        }

        btnDeleteSelected.disabled = (selectedId === null || annotations.find(a => a.id === selectedId)?.hidden);

        annotationListEl.innerHTML = annotations.map(ann => {
            const isSelected = ann.id === selectedId;
            const aiTag = ann.aiGenerated ? '<span class="item-tag">AI</span>' : '';
            if (ann.hidden) {
                return `<div class="annotation-list-item removed" data-id="${ann.id}">
                    <span class="item-color" style="background:${ann.color}; opacity:0.4;"></span>
                    <span class="item-label item-label-removed" data-label-id="${ann.id}">${ann.label || ann.type}</span>
                    <span class="item-tag item-tag-removed">removed</span>
                    <button class="item-restore" data-restore-id="${ann.id}" title="Restore">↩️</button>
                </div>`;
            }
            return `<div class="annotation-list-item ${isSelected ? 'selected' : ''}" data-id="${ann.id}">
                <span class="item-color" style="background:${ann.color};"></span>
                <span class="item-label" data-label-id="${ann.id}">${ann.label || ann.type}</span>
                ${aiTag}
                <button class="item-rename" data-rename-id="${ann.id}" title="Rename">✏️</button>
                <button class="item-delete" data-delete-id="${ann.id}" title="Remove annotation">✕</button>
            </div>`;
        }).join('');

        function startRename(id) {
            const labelEl = annotationListEl.querySelector(`[data-label-id="${id}"]`);
            if (!labelEl) return;
            const ann = annotationLayer.annotations.find(a => a.id === id);
            if (!ann) return;
            annotationLayer.selectAnnotation(id);

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'rename-input';
            input.value = ann.label || '';
            labelEl.replaceWith(input);
            input.focus();
            input.select();

            function commitRename() {
                const newName = input.value.trim();
                if (newName) { annotationLayer.renameAnnotation(id, newName); }
                else { updateAnnotationList(); }
            }
            input.addEventListener('blur', commitRename);
            input.addEventListener('keydown', (ke) => {
                if (ke.key === 'Enter')  { ke.preventDefault(); input.blur(); }
                if (ke.key === 'Escape') { ke.preventDefault(); input.removeEventListener('blur', commitRename); updateAnnotationList(); }
            });
        }

        annotationListEl.querySelectorAll('.annotation-list-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('item-delete'))  return;
                if (e.target.classList.contains('item-rename'))  return;
                if (e.target.classList.contains('item-restore')) return;
                if (e.target.classList.contains('item-label'))   return;
                if (item.classList.contains('removed')) return;
                annotationLayer.selectAnnotation(parseInt(item.dataset.id));
            });
        });
        annotationListEl.querySelectorAll('.item-label:not(.item-label-removed)').forEach(label => {
            label.addEventListener('click',    ()  => annotationLayer.selectAnnotation(parseInt(label.dataset.labelId)));
            label.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(parseInt(label.dataset.labelId)); });
        });
        annotationListEl.querySelectorAll('.item-rename').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); startRename(parseInt(btn.dataset.renameId)); });
        });
        annotationListEl.querySelectorAll('.item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); annotationLayer.deleteAnnotation(parseInt(btn.dataset.deleteId)); });
        });
        annotationListEl.querySelectorAll('.item-restore').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); annotationLayer.restoreAnnotation(parseInt(btn.dataset.restoreId)); });
        });
    }

    annotationLayer.onChange(updateAnnotationList);
    btnDeleteSelected.addEventListener('click', () => annotationLayer.deleteSelected());
    btnAnnotationClear.addEventListener('click', () => {
        if (annotationLayer.count === 0) return;
        if (confirm('Clear all annotations? This cannot be undone.')) annotationLayer.clearAll();
    });
    btnEraseAllToolbar.addEventListener('click', () => {
        const visible = annotationLayer.annotations.filter(a => !a.hidden);
        if (visible.length === 0) { showSnackbar('No annotated objects to remove.'); return; }
        annotationLayer.clearAll();
        btnEraseAllToolbar.style.display = 'none';
        showSnackbar(`🧹 ${visible.length} annotated object${visible.length > 1 ? 's' : ''} removed.`);
    });
    btnExportAnnotations.addEventListener('click', () => {
        if (annotationLayer.count === 0) { alert('No annotations to export.'); return; }
        const json = annotationLayer.exportAnnotations();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'annotations.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    // =========================================================
    // AI DETECT
    // =========================================================
    btnAiDetect.addEventListener('click', () => {
        if (!editor.imageLoaded) return;
        btnAiDetect.disabled = true;
        btnAiDetect.textContent = '⏳ Detecting...';
        setTimeout(() => {
            const count = annotationLayer.aiDetectObjects(canvas);
            btnAiDetect.disabled = false;
            btnAiDetect.textContent = '🤖 AI Detect Objects';
            if (count > 0) {
                if (!annotationMode) toggleAnnotationMode();
                selectTool('select');
            } else {
                alert('No distinct objects detected in this image.');
            }
        }, 600);
    });

    // =========================================================
    // ADJUSTMENT SLIDERS
    // =========================================================
    function resetSliders() {
        brightnessSlider.value = 0; brightnessValue.textContent = '0';
        contrastSlider.value   = 0; contrastValue.textContent   = '0';
        saturationSlider.value = 0; saturationValue.textContent = '0';
    }

    function applyAllAdjustments() {
        const b = parseInt(brightnessSlider.value);
        const c = parseInt(contrastSlider.value);
        const s = parseInt(saturationSlider.value);
        let data = editor.baseImageData;
        if (!data) return;
        if (b !== 0) data = applyBrightness(data, b);
        if (c !== 0) data = applyContrast(data, c);
        if (s !== 0) data = applySaturation(data, s);
        editor.putImageData(data);
    }

    const debouncedPreview = debounce(applyAllAdjustments, 16);
    function onSliderInput(slider, display) { display.textContent = slider.value; debouncedPreview(); }

    brightnessSlider.addEventListener('input', () => onSliderInput(brightnessSlider, brightnessValue));
    contrastSlider.addEventListener('input',   () => onSliderInput(contrastSlider,   contrastValue));
    saturationSlider.addEventListener('input', () => onSliderInput(saturationSlider, saturationValue));

    addSliderTip('brightness');
    addSliderTip('contrast');
    addSliderTip('saturation');

    let adjustmentsDirty = false;
    brightnessSlider.addEventListener('change', () => { adjustmentsDirty = true; });
    contrastSlider.addEventListener('change',   () => { adjustmentsDirty = true; });
    saturationSlider.addEventListener('change', () => { adjustmentsDirty = true; });

    function commitPendingAdjustments() {
        if (!adjustmentsDirty) return;
        adjustmentsDirty = false;
        applyAllAdjustments();
        editor.commitAdjustment();
        resetSliders();
    }

    function withCommit(fn) {
        return (...args) => { commitPendingAdjustments(); fn(...args); };
    }

    // =========================================================
    // FILTERS
    // =========================================================
    btnGrayscale.addEventListener('click', withCommit(() => withTip('btn-grayscale', () => editor.applyOperation(grayscale))));
    btnSepia.addEventListener('click',     withCommit(() => withTip('btn-sepia',     () => editor.applyOperation(sepia))));
    btnInvert.addEventListener('click',    withCommit(() => withTip('btn-invert',    () => editor.applyOperation(invert))));
    btnBlur.addEventListener('click',      withCommit(() => withTip('btn-blur',      () => editor.applyOperation(blur, 3))));

    // ---- Filter Tab Switching ---- (removed: AI button now always visible above manual filters)

    // ---- AI Filter ----
    const AI_FILTERS = [
        {
            name: 'Grayscale',
            rawFn: grayscale,
            rawArgs: [],
            reason: 'Image has low colour variance — monochrome enhances structural detail.',
            effect: 'Removes all colour, converting the image to black & white.',
            confidence: '87%',
        },
        {
            name: 'Sepia',
            rawFn: sepia,
            rawArgs: [],
            reason: 'Warm tones detected — a sepia tone will complement the existing palette.',
            effect: 'Adds a warm brownish vintage tone across the image.',
            confidence: '74%',
        },
        {
            name: 'Invert',
            rawFn: invert,
            rawArgs: [],
            reason: 'High contrast detected — inverting colours may reveal hidden details.',
            effect: 'Flips every colour to its opposite, like a photo negative.',
            confidence: '61%',
        },
        {
            name: 'Blur',
            rawFn: blur,
            rawArgs: [3],
            reason: 'High noise detected — softening the image will reduce visual artefacts.',
            effect: 'Applies a soft blur to smooth out fine details and noise.',
            confidence: '79%',
        },
    ];

    const btnAiFilter          = document.getElementById('btn-ai-filter');
    const filterAiResult       = document.getElementById('filter-ai-result');
    const filterAiAppliedLabel = document.getElementById('filter-ai-applied-label');
    const aiFeedbackOverlay    = document.getElementById('ai-feedback-overlay');
    const aiFeedbackFilterName = document.getElementById('ai-feedback-filter-name');
    const aiFeedbackReason     = document.getElementById('ai-feedback-reason');
    const aiFeedbackEffect     = document.getElementById('ai-feedback-effect');
    const aiFeedbackConfidence = document.getElementById('ai-feedback-confidence');
    const aiFeedbackUp         = document.getElementById('ai-feedback-up');
    const aiFeedbackDown       = document.getElementById('ai-feedback-down');
    const aiFeedbackUndo       = document.getElementById('ai-feedback-undo');
    const aiFeedbackSubmit     = document.getElementById('ai-feedback-submit');
    const feedbackCommentWrap  = document.getElementById('feedback-comment-wrap');
    const feedbackCommentInput = document.getElementById('feedback-comment-input');

    let lastAiFilterName = '';
    let aiFeedbackChoice = null; // 'up' | 'down' | null

    function openAiFeedbackModal(filter) {
        lastAiFilterName = filter.name;
        aiFeedbackChoice = null;
        if (aiFeedbackFilterName) aiFeedbackFilterName.textContent = filter.name;
        if (aiFeedbackReason)     aiFeedbackReason.textContent     = filter.reason;
        if (aiFeedbackEffect)     aiFeedbackEffect.textContent     = filter.effect;
        if (aiFeedbackConfidence) aiFeedbackConfidence.textContent = filter.confidence;
        if (aiFeedbackUp)   aiFeedbackUp.classList.remove('selected-up');
        if (aiFeedbackDown) aiFeedbackDown.classList.remove('selected-down');
        if (feedbackCommentWrap)  feedbackCommentWrap.style.display  = 'none';
        if (feedbackCommentInput) feedbackCommentInput.value = '';
        if (aiFeedbackOverlay) {
            aiFeedbackOverlay.classList.remove('hidden');
            aiFeedbackOverlay.style.display = 'flex';
        }
    }

    function closeAiFeedbackModal() {
        if (aiFeedbackOverlay) {
            aiFeedbackOverlay.classList.add('hidden');
            aiFeedbackOverlay.style.display = 'none';
        }
    }

    btnAiFilter.addEventListener('click', () => {
        if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }

        btnAiFilter.disabled = true;
        btnAiFilter.textContent = '⏳ Analysing image…';

        setTimeout(() => {
            try {
                const chosen = AI_FILTERS[Math.floor(Math.random() * AI_FILTERS.length)];

                // Apply the filter directly
                editor.applyOperation(chosen.rawFn, ...(chosen.rawArgs || []));

                filterAiAppliedLabel.textContent = `✅ Applied: ${chosen.name}`;
                filterAiResult.style.display = 'flex';

                openAiFeedbackModal(chosen);
            } catch(err) {
                console.error('[AI Filter]', err);
                showSnackbar('⚠️ Could not apply AI filter.');
            } finally {
                btnAiFilter.disabled = false;
                btnAiFilter.textContent = '🤖 Apply AI Filter';
            }
        }, 900);
    });

    aiFeedbackUp.addEventListener('click', () => {
        aiFeedbackChoice = 'up';
        aiFeedbackUp.classList.add('selected-up');
        aiFeedbackDown.classList.remove('selected-down');
        feedbackCommentWrap.style.display = 'flex';
    });

    aiFeedbackDown.addEventListener('click', () => {
        aiFeedbackChoice = 'down';
        aiFeedbackDown.classList.add('selected-down');
        aiFeedbackUp.classList.remove('selected-up');
        feedbackCommentWrap.style.display = 'flex';
    });

    aiFeedbackUndo.addEventListener('click', () => {
        closeAiFeedbackModal();
        editor.undo();
        resetSliders();
        filterAiResult.classList.add('hidden');
        showSnackbar('↩️ AI filter undone.');
    });

    aiFeedbackSubmit.addEventListener('click', () => {
        closeAiFeedbackModal();
        const comment = feedbackCommentInput.value.trim();
        if (aiFeedbackChoice === 'up') {
            showSnackbar('👍 Thanks for the positive feedback!');
        } else if (aiFeedbackChoice === 'down') {
            showSnackbar('👎 Thanks — we\'ll use this to improve the AI.');
        } else {
            showSnackbar('✅ Filter kept. Thanks!');
        }
        console.log('[AI Filter Feedback]', { filter: lastAiFilterName, rating: aiFeedbackChoice, comment });
    });

    // =========================================================
    // TRANSFORMS
    // =========================================================
    btnRotateCW.addEventListener('click',  withCommit(() => withTip('btn-rotate-cw',  () => { editor.applyTransform(rotateCW);  annotationLayer.syncSize(); })));
    btnRotateCCW.addEventListener('click', withCommit(() => withTip('btn-rotate-ccw', () => { editor.applyTransform(rotateCCW); annotationLayer.syncSize(); })));
    btnFlipH.addEventListener('click',     withCommit(() => withTip('btn-flip-h',     () => { editor.applyTransform(flipH);     annotationLayer.syncSize(); })));
    btnFlipV.addEventListener('click',     withCommit(() => withTip('btn-flip-v',     () => { editor.applyTransform(flipV);     annotationLayer.syncSize(); })));

    // =========================================================
    // CROP
    // =========================================================
    btnCrop.addEventListener('click', withCommit(() => withTip('btn-crop', () => {
        if (editor.imageLoaded) cropTool.activate();
    })));
    btnCropApply.addEventListener('click',  () => { cropTool.applyCrop(); annotationLayer.syncSize(); });
    btnCropCancel.addEventListener('click', () => cropTool.deactivate());

    // =========================================================
    // UNDO / REDO
    // =========================================================
    btnUndo.addEventListener('click', () => withTip('btn-undo', () => {
        commitPendingAdjustments(); editor.undo(); resetSliders(); annotationLayer.syncSize();
    }));
    btnRedo.addEventListener('click', () => withTip('btn-redo', () => {
        commitPendingAdjustments(); editor.redo(); resetSliders(); annotationLayer.syncSize();
    }));

    // =========================================================
    // KEYBOARD SHORTCUTS
    // =========================================================
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault(); toggleAnnotationMode(); return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement.tagName !== 'INPUT') {
            if (annotationLayer.selectedId !== null) { e.preventDefault(); annotationLayer.deleteSelected(); }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            commitPendingAdjustments();
            if (e.shiftKey) { editor.redo(); } else { editor.undo(); }
            resetSliders(); annotationLayer.syncSize();
        }
    });

    // =========================================================
    // DOWNLOAD & RESET
    // =========================================================
    btnDownload.addEventListener('click', withCommit(() => withTip('btn-download', () => {
        if (!editor.imageLoaded) return;
        const merged = annotationLayer.flattenOnto(canvas);
        downloadDataURL(merged.toDataURL('image/png'), 'edited-image.png');
    })));

    btnReset.addEventListener('click', () => withTip('btn-reset', () => {
        if (!editor.originalImage) return;
        const img = editor.originalImage;
        let w = img.width, h = img.height;
        const MAX = 4000;
        if (w > MAX || h > MAX) {
            const ratio = Math.min(MAX / w, MAX / h);
            w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        canvas.width = w; canvas.height = h;
        editor.ctx.drawImage(img, 0, 0, w, h);
        editor.history.clear();
        editor.history.push(editor.getImageData());
        editor.baseImageData = editor.getImageData();
        adjustmentsDirty = false;
        resetSliders();
        annotationLayer.clearAll();
        annotationLayer.syncSize();
        editor._notifyChange();
    }));

    // =========================================================
    // COLLAPSIBLE PANELS
    // =========================================================
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => header.closest('.collapsible').classList.toggle('collapsed'));
    });

    // =========================================================
    // UI STATE
    // =========================================================
    editor.onChange(() => {
        btnUndo.disabled = !editor.history.canUndo();
        btnRedo.disabled = !editor.history.canRedo();
    });

    btnUndo.disabled = true;
    btnRedo.disabled = true;
});
