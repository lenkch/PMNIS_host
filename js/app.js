/**
 * App bootstrap — new layout: icon rail + sliding left panel + sliding right AI panel.
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

    const TIPS = {
        'btn-grayscale': { title: '🖤 Grayscale',   text: 'Removes all colour from your image, turning it black & white.' },
        'btn-sepia':     { title: '🟤 Sepia',        text: 'Adds a warm brownish tone — great for a vintage look.' },
        'btn-invert':    { title: '🔄 Invert',       text: 'Flips every colour to its opposite — like a photo negative.' },
        'btn-blur':      { title: '💧 Blur',         text: 'Softens the image by smoothing out fine details.' },
        'btn-rotate-cw': { title: '↻ Rotate CW',    text: 'Turns the image 90° to the right.' },
        'btn-rotate-ccw':{ title: '↺ Rotate CCW',   text: 'Turns the image 90° to the left.' },
        'btn-flip-h':    { title: '⇔ Flip H',        text: 'Mirrors the image left-to-right.' },
        'btn-flip-v':    { title: '⇕ Flip V',        text: 'Mirrors the image upside-down.' },
        'btn-crop':      { title: '✂️ Crop',         text: 'Draw a rectangle on the image to keep only that area.' },
        'btn-undo':      { title: '↩️ Undo',         text: 'Steps back to the previous state.' },
        'btn-redo':      { title: '↪️ Redo',         text: 'Re-applies a change you just undid.' },
        'btn-reset':     { title: '🔄 Reset',        text: 'Reverts the image all the way back to the original.' },
        'btn-download':  { title: '💾 Save',         text: 'Downloads the edited image as a PNG file.' },
        'brightness':    { title: '☀️ Brightness',   text: 'Drag right to lighten, left to darken.' },
        'contrast':      { title: '◑ Contrast',      text: 'Drag right to make dark and light areas more distinct.' },
        'saturation':    { title: '🎨 Saturation',   text: 'Drag right for vivid colours, left to wash them out.' },
    };

    // Guided tour — covers every section in order
    const TOUR_STEPS = [
        { targetId: 'pane-crop',    tool: 'crop',    title: '✂️ Crop & Transform',  text: 'Here you can crop your photo to any area, or rotate and flip it.' },
        { targetId: 'pane-adjust',  tool: 'adjust',  title: '🎨 Adjustments',        text: 'Drag the sliders to change brightness, contrast, saturation, exposure, highlights and shadows — all previewed live.' },
        { targetId: 'pane-filters', tool: 'filters', title: '✨ Filters',             text: 'Apply one-click colour styles like Warm, Cool or Sepia, or add blur, sharpen and noise effects. Build your own look at the bottom.' },
        { targetId: 'pane-retouch', tool: 'retouch', title: '🪄 Retouch',            text: 'Paint directly on the image to heal blemishes, smooth skin or sharpen details. Use the radius and strength sliders to control the brush.' },
        { targetId: 'pane-objects', tool: 'objects', title: '🎯 Add / Remove Objects', text: 'Draw a rectangle on the image, then generate a new object or remove the selected area with AI.' },
        { targetId: 'pane-ai',      tool: 'ai',      title: '🤖 AI Tools',           text: 'Let AI automatically improve your whole photo in one click, or choose a specific AI action for adjustments, filters, cropping or retouching.' },
        { targetId: 'pane-text',    tool: 'text',    title: 'T Text',                text: 'Choose a font size and colour, then click anywhere on the image to stamp text onto it.' },
        { targetId: 'btn-undo',     tool: null,      title: '↩️ Undo & Redo',        text: 'Made a mistake? Undo steps back one change. Redo brings it forward. Shortcut: Ctrl+Z / Ctrl+Shift+Z.' },
        { targetId: 'btn-download', tool: null,      title: '💾 Save',               text: 'Happy with the result? Click Save to download your edited photo as a PNG.' },
    ];

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
            <div class="tour-progress"><div class="tour-progress-bar" id="tour-progress-bar"></div></div>
            <div class="tour-actions">
                <button class="btn" id="tour-skip">Skip tour</button>
                <div class="tour-nav">
                    <button class="btn" id="tour-back">← Back</button>
                    <button class="btn btn-primary" id="tour-next">Next →</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(tourOverlay);

    let tourStep = 0, tourHighlightEl = null, tourDone = false;
    const tourBlocker = document.getElementById('tour-blocker');

    function highlightEl(id) {
        if (tourHighlightEl) tourHighlightEl.classList.remove('tour-highlight');
        const el = id ? document.getElementById(id) : null;
        if (el) { el.classList.add('tour-highlight'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
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
        if (tourBlocker) tourBlocker.classList.remove('hidden');
        // Open the tool so the pane is visible for highlighting
        if (step.tool && typeof openTool === 'function') openTool(step.tool);
        highlightEl(step.targetId);
        positionTourPopup(step.targetId);
    }

    function endTour() {
        tourOverlay.classList.add('hidden');
        if (tourBlocker) tourBlocker.classList.add('hidden');
        if (tourHighlightEl) { tourHighlightEl.classList.remove('tour-highlight'); tourHighlightEl = null; }
        tourDone = true;
    }

    document.getElementById('tour-next').addEventListener('click', () => {
        if (tourStep < TOUR_STEPS.length - 1) { tourStep++; showTourStep(tourStep); } else endTour();
    });
    document.getElementById('tour-back').addEventListener('click', () => {
        if (tourStep > 0) { tourStep--; showTourStep(tourStep); }
    });
    document.getElementById('tour-skip').addEventListener('click', endTour);

    // Per-action tip popup
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
        // Once tour is done, never show per-action tips again
        if (tourDone || currentRole !== 'beginner' || tipsDisabled || seenTips.has(id) || !TIPS[id]) { action(); return; }
        seenTips.add(id);
        showTipPopup(TIPS[id].title, TIPS[id].text, action);
    }

    function addSliderTip(sliderId) {
        const slider = document.getElementById(sliderId);
        if (!slider) return;
        let shown = false;
        slider.addEventListener('mousedown', () => {
            if (currentRole !== 'beginner' || tipsDisabled || shown || !TIPS[sliderId]) return;
            shown = true; seenTips.add(sliderId);
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

    // =========================================================
    // CORE SETUP
    // =========================================================
    const canvas            = document.getElementById('editor-canvas');
    const annotationOverlay = document.getElementById('annotation-overlay');
    const editor            = new Editor(canvas);
    const cropTool          = new CropTool(editor);
    const annotationLayer   = new AnnotationLayer(annotationOverlay, canvas);

    const dropZone      = document.getElementById('drop-zone');
    const fileInput     = document.getElementById('file-input');
    const uploadBtn     = document.getElementById('upload-btn');
    const workspace     = document.getElementById('workspace');
    const modeIndicator = document.getElementById('mode-indicator');
    const modeIndicatorText = document.getElementById('mode-indicator-text');

    const btnUndo     = document.getElementById('btn-undo');
    const btnRedo     = document.getElementById('btn-redo');
    const btnDownload = document.getElementById('btn-download');
    const btnReset    = document.getElementById('btn-reset');
    const btnCompare  = document.getElementById('btn-compare');

    // Left panel controls
    const btnCrop           = document.getElementById('btn-crop');
    const btnCropApply      = document.getElementById('btn-crop-apply');
    const btnCropCancel     = document.getElementById('btn-crop-cancel');
    const cropActionsInline = document.getElementById('crop-actions-inline');
    const btnRotateCW       = document.getElementById('btn-rotate-cw');
    const btnRotateCCW      = document.getElementById('btn-rotate-ccw');
    const btnFlipH          = document.getElementById('btn-flip-h');
    const btnFlipV          = document.getElementById('btn-flip-v');

    const brightnessSlider = document.getElementById('brightness');
    const contrastSlider   = document.getElementById('contrast');
    const saturationSlider = document.getElementById('saturation');
    const brightnessValue  = document.getElementById('brightness-value');
    const contrastValue    = document.getElementById('contrast-value');
    const saturationValue  = document.getElementById('saturation-value');

    // Extra adjustment sliders (exposure, highlights, shadows)
    const exposureSlider   = document.getElementById('exposure');
    const highlightsSlider = document.getElementById('highlights');
    const shadowsSlider    = document.getElementById('shadows');
    const exposureValue    = document.getElementById('exposure-value');
    const highlightsValue  = document.getElementById('highlights-value');
    const shadowsValue     = document.getElementById('shadows-value');

    // Filters
    const btnGrayscale = document.getElementById('btn-grayscale');
    const btnSepia     = document.getElementById('btn-sepia');
    const btnInvert    = document.getElementById('btn-invert');
    const btnBlur      = document.getElementById('btn-blur');
    const btnWarm      = document.getElementById('btn-warm');
    const btnCool      = document.getElementById('btn-cool');
    const btnVivid     = document.getElementById('btn-vivid');
    const btnFade      = document.getElementById('btn-fade');
    const btnSharpen   = document.getElementById('btn-sharpen');
    const btnNoise     = document.getElementById('btn-noise');
    const blurAmountSlider = document.getElementById('blur-amount');
    const blurAmountValue  = document.getElementById('blur-amount-value');
    let currentBlurAmount  = 3;

    // Retouch
    const retouchRadiusSlider   = document.getElementById('retouch-radius');
    const retouchStrengthSlider = document.getElementById('retouch-strength');
    const retouchRadiusValue    = document.getElementById('retouch-radius-value');
    const retouchStrengthValue  = document.getElementById('retouch-strength-value');
    const retouchHint           = document.getElementById('retouch-hint');
    const retouchCursor         = document.getElementById('retouch-cursor');
    const retouchModeButtons    = document.querySelectorAll('.retouch-mode-toggle .mode-btn');
    let retouchMode    = 'heal';
    let retouchRadius  = 20;
    let retouchStrength = 50;
    let retouchPainting = false;

    // Objects pane
    const btnModeAdd             = document.getElementById('btn-mode-add');
    const btnModeRemove          = document.getElementById('btn-mode-remove');
    const objectPromptInput      = document.getElementById('object-prompt');
    const btnGenerateObject      = document.getElementById('btn-generate-object');
    const btnRemoveObject        = document.getElementById('btn-remove-object');
    const btnClearSelection      = document.getElementById('btn-clear-selection');
    const addObjectInputDiv      = document.getElementById('add-object-input');
    const removeObjectActionsDiv = document.getElementById('remove-object-actions');
    const objectsInstructionText = document.getElementById('objects-instruction-text');

    // AI Tools
    const btnAiOverall     = document.getElementById('btn-ai-overall');
    const btnAiAdjustCat   = document.getElementById('btn-ai-adjust');
    const btnAiFilterCat   = document.getElementById('btn-ai-filter');
    const btnAiCropCat     = document.getElementById('btn-ai-crop');
    const btnAiRetouchCat  = document.getElementById('btn-ai-retouch-btn');

    // Chatbot (floating)
    const chatbotMessages  = document.getElementById('chatbot-messages');
    const chatbotInput     = document.getElementById('chatbot-input');
    const chatbotSend      = document.getElementById('chatbot-send');
    const chatbotBubble    = document.getElementById('chatbot-bubble');
    const chatbotFloat     = document.getElementById('chatbot-float');
    const chatbotFloatClose= document.getElementById('chatbot-float-close');

    // Text tool
    const textSizeSlider = document.getElementById('text-size');
    const textSizeValue  = document.getElementById('text-size-value');
    const colorSwatches  = document.querySelectorAll('.color-swatch[data-color]');
    let textColor = '#ffffff';
    let textSize  = 24;
    let textToolActive = false;

    let objectsMode = 'add';
    let retouchActive = false;

    // =========================================================
    // TOOL RAIL — panel open/close logic
    // =========================================================
    const toolPanel      = document.getElementById('tool-panel');
    const toolPanelTitle = document.getElementById('tool-panel-title');
    const toolPanelClose = document.getElementById('tool-panel-close');
    const aiPanel        = document.getElementById('ai-panel');
    const aiPanelTitle   = document.getElementById('ai-panel-title');
    const aiPanelBody    = document.getElementById('ai-panel-body');
    const aiPanelClose   = document.getElementById('ai-panel-close');
    const railBtns       = document.querySelectorAll('.rail-btn[data-tool]');

    const PANE_TITLES = {
        crop:    'Crop & Transform',
        adjust:  'Adjustments',
        filters: 'Filters',
        retouch: 'Retouch',
        objects: 'Add / Remove Objects',
        ai:      'AI Tools',
        text:    'Text',
    };

    const AI_PANEL_CONTENT = {
        crop: {
            title: 'AI Crop Suggestions',
            html: `
                <div class="ai-section-label">Smart Suggestions</div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">✂️ Rule of Thirds</div>
                    <div class="ai-suggestion-desc">Crop to align the main subject along the rule-of-thirds grid for a more balanced composition.</div>
                    <button class="ai-suggestion-apply" data-ai-action="crop-thirds">Apply</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🔲 Square Crop</div>
                    <div class="ai-suggestion-desc">Crop to a 1:1 square — perfect for social media.</div>
                    <button class="ai-suggestion-apply" data-ai-action="crop-square">Apply</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🔄 Auto Straighten</div>
                    <div class="ai-suggestion-desc">AI detected the horizon is slightly tilted. Auto-rotate to straighten it.</div>
                    <button class="ai-suggestion-apply" data-ai-action="auto-straighten">Apply</button>
                </div>`
        },
        adjust: {
            title: 'AI Adjustments',            html: `
                <div class="ai-section-label">Auto Enhance</div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">✨ Auto Enhance</div>
                    <div class="ai-suggestion-desc">AI will automatically optimise brightness, contrast and saturation based on your image content.</div>
                    <button class="ai-suggestion-apply" data-ai-action="auto-enhance">Apply</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">☀️ Boost Brightness</div>
                    <div class="ai-suggestion-desc">Image appears underexposed. AI suggests increasing brightness by +30.</div>
                    <button class="ai-suggestion-apply" data-ai-action="boost-brightness">Apply</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🎨 Vivid Colours</div>
                    <div class="ai-suggestion-desc">Boost saturation to make colours more vibrant and eye-catching.</div>
                    <button class="ai-suggestion-apply" data-ai-action="vivid">Apply</button>
                </div>`
        },
        filters: {
            title: 'AI Filter Suggestions',
            html: `
                <div class="ai-section-label">Smart Filter</div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🤖 Apply AI Filter</div>
                    <div class="ai-suggestion-desc">Let AI analyse and pick the best filter for your photo automatically.</div>
                    <button class="ai-suggestion-apply" data-ai-action="ai-filter">Apply</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🖤 Grayscale</div>
                    <div class="ai-suggestion-desc">AI detected low colour variance — converting to black & white may improve impact.</div>
                    <button class="ai-suggestion-apply" data-ai-action="suggest-grayscale">Apply</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🟤 Vintage Look</div>
                    <div class="ai-suggestion-desc">Warm tones detected — a sepia filter would complement the existing palette.</div>
                    <button class="ai-suggestion-apply" data-ai-action="suggest-sepia">Apply</button>
                </div>`
        },
        retouch: {
            title: 'AI Retouch',
            html: `
                <div class="ai-section-label">Smart Heal</div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🩹 Auto Heal</div>
                    <div class="ai-suggestion-desc">AI detects blemishes and noise areas and automatically heals them.</div>
                    <button class="ai-suggestion-apply" data-ai-action="auto-heal">Apply</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🌊 Portrait Smooth</div>
                    <div class="ai-suggestion-desc">Smooth skin tones while preserving fine details like eyes and hair.</div>
                    <button class="ai-suggestion-apply" data-ai-action="portrait-smooth">Apply</button>
                </div>`
        },
        objects: {
            title: 'AI Objects',
            html: `
                <div class="ai-section-label">Object Detection</div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🔍 Detect Objects</div>
                    <div class="ai-suggestion-desc">AI scans your image and highlights objects so you can easily select and remove them.</div>
                    <button class="ai-suggestion-apply" data-ai-action="detect-objects">Detect</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">✨ Smart Inpaint</div>
                    <div class="ai-suggestion-desc">After drawing a selection, AI fills the area with a realistic background.</div>
                    <button class="ai-suggestion-apply" data-ai-action="smart-inpaint">Apply</button>
                </div>`
        },
        ai: {
            title: 'AI Assistant',
            html: `
                <div class="ai-section-label">About AI Tools</div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">💡 What can AI do?</div>
                    <div class="ai-suggestion-desc">AI tools can automatically enhance your photo, apply smart filters, detect and remove objects, and suggest optimal crops.</div>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🔒 Privacy</div>
                    <div class="ai-suggestion-desc">Your images are processed locally in the browser — nothing is sent to a server.</div>
                </div>`
        },
        text: {
            title: 'AI Text Suggestions',
            html: `
                <div class="ai-section-label">Style Ideas</div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">💬 Caption Suggestion</div>
                    <div class="ai-suggestion-desc">AI can suggest a caption based on the content of your image.</div>
                    <button class="ai-suggestion-apply" data-ai-action="suggest-caption">Suggest</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-title">🎨 Contrast Check</div>
                    <div class="ai-suggestion-desc">AI will check that your text colour contrasts well with the background at the click point.</div>
                    <button class="ai-suggestion-apply" data-ai-action="contrast-check">Check</button>
                </div>`
        },
    };

    let activeTool = null;

    function openTool(tool) {
        // Toggle: clicking same tool closes it
        if (activeTool === tool) {
            closeTool();
            return;
        }

        // Deactivate text tool if switching away
        if (activeTool === 'text') deactivateTextTool();

        activeTool = tool;

        // Update rail active state
        railBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));

        // Show the correct pane, hide others
        document.querySelectorAll('.tool-pane').forEach(p => p.style.display = 'none');
        const pane = document.getElementById(`pane-${tool}`);
        if (pane) pane.style.display = 'flex';

        // Update panel title and open it
        toolPanelTitle.textContent = PANE_TITLES[tool] || tool;
        toolPanel.classList.add('open');

        // Update and open the right AI panel
        const aiContent = AI_PANEL_CONTENT[tool];
        if (aiContent) {
            aiPanelTitle.textContent = aiContent.title;
            aiPanelBody.innerHTML = aiContent.html;
            // Wire up AI action buttons
            aiPanelBody.querySelectorAll('.ai-suggestion-apply[data-ai-action]').forEach(btn => {
                btn.addEventListener('click', () => handleAiAction(btn.dataset.aiAction));
            });
        }
        aiPanel.classList.add('open');

        // Special activations per tool
        if (tool === 'text') activateTextTool();
        if (tool === 'retouch') activateRetouchTool();
        else if (retouchActive) deactivateRetouchTool();
        if (tool === 'objects') {
            if (editor.imageLoaded && !annotationLayer.active) annotationLayer.activate();
        }
        if (tool === 'filters' && editor.imageLoaded) {
            // Refresh custom filter preview after panel is visible
            setTimeout(() => { if (typeof buildCustomFilterPreview === 'function') buildCustomFilterPreview(); }, 50);
        }
    }

    function closeTool() {
        if (activeTool === 'text') deactivateTextTool();
        if (activeTool === 'retouch') deactivateRetouchTool();
        if (activeTool === 'crop' && cropTool.active) cropTool.deactivate();
        activeTool = null;
        railBtns.forEach(b => b.classList.remove('active'));
        toolPanel.classList.remove('open');
        aiPanel.classList.remove('open');
    }

    railBtns.forEach(btn => btn.addEventListener('click', () => openTool(btn.dataset.tool)));
    toolPanelClose.addEventListener('click', closeTool);
    aiPanelClose.addEventListener('click',   () => { aiPanel.classList.remove('open'); });

    // =========================================================
    // AI PANEL ACTIONS
    // =========================================================
    function handleAiAction(action) {
        if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }

        switch (action) {
            case 'auto-enhance':
                commitPendingAdjustments();
                brightnessSlider.value = 15; brightnessValue.textContent = '15';
                contrastSlider.value   = 20; contrastValue.textContent   = '20';
                saturationSlider.value = 10; saturationValue.textContent = '10';
                applyAllAdjustments();
                editor.commitAdjustment();
                resetSliders();
                showSnackbar('✨ Auto enhance applied!');
                break;
            case 'boost-brightness':
                commitPendingAdjustments();
                brightnessSlider.value = 30; brightnessValue.textContent = '30';
                applyAllAdjustments();
                editor.commitAdjustment();
                resetSliders();
                showSnackbar('☀️ Brightness boosted!');
                break;
            case 'vivid':
                commitPendingAdjustments();
                saturationSlider.value = 40; saturationValue.textContent = '40';
                applyAllAdjustments();
                editor.commitAdjustment();
                resetSliders();
                showSnackbar('🎨 Vivid colours applied!');
                break;
            case 'ai-filter':
                triggerAiFilter();
                break;
            case 'suggest-grayscale':
                commitPendingAdjustments();
                editor.applyOperation(grayscale);
                showSnackbar('🖤 Grayscale filter applied!');
                break;
            case 'suggest-sepia':
                commitPendingAdjustments();
                editor.applyOperation(sepia);
                showSnackbar('🟤 Sepia filter applied!');
                break;
            case 'smart-inpaint':
            case 'detect-objects':
                showSnackbar('🔍 Object detection would run here (AI integration needed)');
                break;
            case 'crop-thirds':
            case 'crop-square':
            case 'auto-straighten':
                showSnackbar(`🤖 "${action}" would run here (AI integration needed)`);
                break;
            case 'suggest-caption':
                showSnackbar('💬 Caption suggestion would appear here (AI integration needed)');
                break;
            case 'contrast-check':
                showSnackbar('🎨 Contrast check would run here (AI integration needed)');
                break;
            default:
                showSnackbar(`🤖 AI action "${action}" (integration needed)`);
        }
    }

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
    // CROP
    // =========================================================
    btnCrop.addEventListener('click', withCommitWrap(() => withTip('btn-crop', () => {
        if (!editor.imageLoaded) return;
        cropTool.activate();
        btnCrop.style.display = 'none';
        cropActionsInline.style.display = 'flex';
        modeIndicatorText.textContent = 'Crop Mode';
        modeIndicator.style.display = 'flex';
    })));

    btnCropApply.addEventListener('click', () => {
        cropTool.applyCrop();
        annotationLayer.syncSize();
        btnCrop.style.display = '';
        cropActionsInline.style.display = 'none';
        modeIndicator.style.display = 'none';
    });

    btnCropCancel.addEventListener('click', () => {
        cropTool.deactivate();
        btnCrop.style.display = '';
        cropActionsInline.style.display = 'none';
        modeIndicator.style.display = 'none';
    });

    // =========================================================
    // TRANSFORMS
    // =========================================================
    btnRotateCW.addEventListener('click',  withCommitWrap(() => withTip('btn-rotate-cw',  () => { editor.applyTransform(rotateCW);  annotationLayer.syncSize(); })));
    btnRotateCCW.addEventListener('click', withCommitWrap(() => withTip('btn-rotate-ccw', () => { editor.applyTransform(rotateCCW); annotationLayer.syncSize(); })));
    btnFlipH.addEventListener('click',     withCommitWrap(() => withTip('btn-flip-h',     () => { editor.applyTransform(flipH);     annotationLayer.syncSize(); })));
    btnFlipV.addEventListener('click',     withCommitWrap(() => withTip('btn-flip-v',     () => { editor.applyTransform(flipV);     annotationLayer.syncSize(); })));

    // =========================================================
    // ADJUSTMENT SLIDERS
    // =========================================================
    function resetSliders() {
        brightnessSlider.value = 0; brightnessValue.textContent = '0';
        contrastSlider.value   = 0; contrastValue.textContent   = '0';
        saturationSlider.value = 0; saturationValue.textContent = '0';
        if (exposureSlider)   { exposureSlider.value   = 0; exposureValue.textContent   = '0'; }
        if (highlightsSlider) { highlightsSlider.value  = 0; highlightsValue.textContent  = '0'; }
        if (shadowsSlider)    { shadowsSlider.value     = 0; shadowsValue.textContent     = '0'; }
    }

    function applyAllAdjustments() {
        const b = parseInt(brightnessSlider.value);
        const c = parseInt(contrastSlider.value);
        const s = parseInt(saturationSlider.value);
        const e = exposureSlider   ? parseInt(exposureSlider.value)   : 0;
        const h = highlightsSlider ? parseInt(highlightsSlider.value) : 0;
        const sh = shadowsSlider   ? parseInt(shadowsSlider.value)    : 0;
        let data = editor.baseImageData;
        if (!data) return;
        if (b !== 0) data = applyBrightness(data, b);
        if (e !== 0) data = applyBrightness(data, Math.round(e * 0.6));
        if (c !== 0) data = applyContrast(data, c);
        if (s !== 0) data = applySaturation(data, s);
        // highlights: boost pixels already bright
        if (h !== 0) {
            const d2 = new Uint8ClampedArray(data.data);
            for (let i = 0; i < d2.length; i += 4) {
                const brightness = (d2[i] + d2[i+1] + d2[i+2]) / 3;
                const factor = h > 0 ? (brightness / 255) * (h / 100) * 80 : (brightness / 255) * (h / 100) * 80;
                d2[i]   = Math.min(255, Math.max(0, d2[i]   + factor));
                d2[i+1] = Math.min(255, Math.max(0, d2[i+1] + factor));
                d2[i+2] = Math.min(255, Math.max(0, d2[i+2] + factor));
            }
            data = new ImageData(d2, data.width, data.height);
        }
        // shadows: boost/reduce dark pixels
        if (sh !== 0) {
            const d3 = new Uint8ClampedArray(data.data);
            for (let i = 0; i < d3.length; i += 4) {
                const brightness = (d3[i] + d3[i+1] + d3[i+2]) / 3;
                const factor = (1 - brightness / 255) * (sh / 100) * 80;
                d3[i]   = Math.min(255, Math.max(0, d3[i]   + factor));
                d3[i+1] = Math.min(255, Math.max(0, d3[i+1] + factor));
                d3[i+2] = Math.min(255, Math.max(0, d3[i+2] + factor));
            }
            data = new ImageData(d3, data.width, data.height);
        }
        editor.putImageData(data);
    }

    const debouncedPreview = debounce(applyAllAdjustments, 16);
    function onSliderInput(slider, display) { display.textContent = slider.value; debouncedPreview(); }

    brightnessSlider.addEventListener('input', () => onSliderInput(brightnessSlider, brightnessValue));
    contrastSlider.addEventListener('input',   () => onSliderInput(contrastSlider,   contrastValue));
    saturationSlider.addEventListener('input', () => onSliderInput(saturationSlider, saturationValue));
    if (exposureSlider)   exposureSlider.addEventListener('input',   () => onSliderInput(exposureSlider,   exposureValue));
    if (highlightsSlider) highlightsSlider.addEventListener('input', () => onSliderInput(highlightsSlider, highlightsValue));
    if (shadowsSlider)    shadowsSlider.addEventListener('input',    () => onSliderInput(shadowsSlider,    shadowsValue));

    addSliderTip('brightness');
    addSliderTip('contrast');
    addSliderTip('saturation');

    let adjustmentsDirty = false;
    brightnessSlider.addEventListener('change', () => { adjustmentsDirty = true; });
    contrastSlider.addEventListener('change',   () => { adjustmentsDirty = true; });
    saturationSlider.addEventListener('change', () => { adjustmentsDirty = true; });
    if (exposureSlider)   exposureSlider.addEventListener('change',   () => { adjustmentsDirty = true; });
    if (highlightsSlider) highlightsSlider.addEventListener('change', () => { adjustmentsDirty = true; });
    if (shadowsSlider)    shadowsSlider.addEventListener('change',    () => { adjustmentsDirty = true; });

    function commitPendingAdjustments() {
        if (!adjustmentsDirty) return;
        adjustmentsDirty = false;
        applyAllAdjustments();
        editor.commitAdjustment();
        resetSliders();
    }

    function withCommitWrap(fn) {
        return (...args) => { commitPendingAdjustments(); fn(...args); };
    }

    // =========================================================
    // COMPARE WITH ORIGINAL
    // =========================================================
    const compareCanvas = document.getElementById('compare-canvas');
    const compareBadge  = document.getElementById('compare-badge');

    // Move compare-canvas inside canvas-wrapper so it sits exactly over editor-canvas
    const canvasWrapper = canvas.parentElement;
    if (compareCanvas.parentElement !== canvasWrapper) {
        canvasWrapper.appendChild(compareCanvas);
        canvasWrapper.appendChild(compareBadge);
    }

    function startCompare() {
        if (!editor.imageLoaded || !editor.originalImage) return;
        compareCanvas.width  = canvas.width;
        compareCanvas.height = canvas.height;
        // Match the rendered CSS size of editor-canvas exactly
        compareCanvas.style.position = 'absolute';
        compareCanvas.style.top    = '0';
        compareCanvas.style.left   = '0';
        compareCanvas.style.width  = canvas.offsetWidth  + 'px';
        compareCanvas.style.height = canvas.offsetHeight + 'px';
        compareCanvas.style.zIndex = '5';
        const ctx = compareCanvas.getContext('2d');
        ctx.drawImage(editor.originalImage, 0, 0, canvas.width, canvas.height);
        compareCanvas.style.display = 'block';
        compareBadge.style.display  = 'block';
        btnCompare.classList.add('comparing');
    }

    function stopCompare() {
        compareCanvas.style.display = 'none';
        compareBadge.style.display  = 'none';
        btnCompare.classList.remove('comparing');
    }

    if (btnCompare) {
        btnCompare.addEventListener('mousedown',  (e) => { e.preventDefault(); startCompare(); });
        document.addEventListener('mouseup', stopCompare);
        btnCompare.addEventListener('touchstart', (e) => { e.preventDefault(); startCompare(); }, { passive: false });
        document.addEventListener('touchend', stopCompare);
        // Safety: if mouse leaves window while held, stop compare
        document.addEventListener('mouseleave', stopCompare);
    }

    // =========================================================
    // FILTERS
    // =========================================================
    // Colour style helpers
    function applyWarm(imageData) {
        const d = new Uint8ClampedArray(imageData.data);
        for (let i = 0; i < d.length; i += 4) {
            d[i]     = Math.min(255, d[i]     + 20); // R up
            d[i + 2] = Math.max(0,   d[i + 2] - 15); // B down
        }
        return new ImageData(d, imageData.width, imageData.height);
    }
    function applyCool(imageData) {
        const d = new Uint8ClampedArray(imageData.data);
        for (let i = 0; i < d.length; i += 4) {
            d[i]     = Math.max(0,   d[i]     - 15); // R down
            d[i + 2] = Math.min(255, d[i + 2] + 20); // B up
        }
        return new ImageData(d, imageData.width, imageData.height);
    }
    function applyVividFilter(imageData) {
        return applySaturation(imageData, 50);
    }
    function applyFade(imageData) {
        const d = new Uint8ClampedArray(imageData.data);
        for (let i = 0; i < d.length; i += 4) {
            d[i]     = Math.round(d[i]     * 0.85 + 30);
            d[i + 1] = Math.round(d[i + 1] * 0.85 + 30);
            d[i + 2] = Math.round(d[i + 2] * 0.85 + 30);
        }
        return new ImageData(d, imageData.width, imageData.height);
    }
    function applySharpenFilter(imageData) {
        const w = imageData.width, h = imageData.height;
        const src = imageData.data;
        const out = new Uint8ClampedArray(src);
        const kernel = [0,-1,0,-1,5,-1,0,-1,0];
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let val = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            val += src[((y+ky)*w + (x+kx))*4+c] * kernel[(ky+1)*3+(kx+1)];
                        }
                    }
                    out[(y*w+x)*4+c] = Math.min(255, Math.max(0, val));
                }
            }
        }
        return new ImageData(out, w, h);
    }
    function applyNoiseFilter(imageData) {
        const d = new Uint8ClampedArray(imageData.data);
        const amount = 25;
        for (let i = 0; i < d.length; i += 4) {
            const n = (Math.random() - 0.5) * amount * 2;
            d[i]     = Math.min(255, Math.max(0, d[i]     + n));
            d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
            d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
        }
        return new ImageData(d, imageData.width, imageData.height);
    }

    blurAmountSlider.addEventListener('input', () => {
        currentBlurAmount = parseInt(blurAmountSlider.value);
        blurAmountValue.textContent = currentBlurAmount;
    });

    // Track which filter button is currently active/applied
    let activeFilterBtn = null;
    const filterIntensityBar = document.getElementById('filter-intensity-bar');
    const filterIntensityFill = document.getElementById('filter-intensity-fill');

    function setActiveFilter(btn, intensity = 100) {
        // Deactivate previous
        if (activeFilterBtn && activeFilterBtn !== btn) {
            activeFilterBtn.classList.remove('filter-applied');
        }
        activeFilterBtn = btn;
        if (btn) {
            btn.classList.add('filter-applied');
            if (filterIntensityBar) filterIntensityBar.style.display = 'block';
            if (filterIntensityFill) filterIntensityFill.style.width = intensity + '%';
        } else {
            if (filterIntensityBar) filterIntensityBar.style.display = 'none';
        }
    }

    function clearActiveFilter() {
        if (activeFilterBtn) activeFilterBtn.classList.remove('filter-applied');
        activeFilterBtn = null;
        if (filterIntensityBar) filterIntensityBar.style.display = 'none';
    }

    function makeFilterClick(btn, fn) {
        return withCommitWrap(() => {
            if (!editor.imageLoaded) return;
            // If already applied, don't apply again
            if (btn.classList.contains('filter-applied')) {
                showSnackbar('Filter already applied. Reset first to reapply.');
                return;
            }
            fn();
            setActiveFilter(btn);
        });
    }

    btnGrayscale.addEventListener('click', makeFilterClick(btnGrayscale, () => withTip('btn-grayscale', () => editor.applyOperation(grayscale))));
    btnSepia.addEventListener('click',     makeFilterClick(btnSepia,     () => withTip('btn-sepia',     () => editor.applyOperation(sepia))));
    btnInvert.addEventListener('click',    makeFilterClick(btnInvert,    () => withTip('btn-invert',    () => editor.applyOperation(invert))));
    btnBlur.addEventListener('click',      makeFilterClick(btnBlur,      () => withTip('btn-blur',      () => editor.applyOperation(blur, currentBlurAmount))));
    btnWarm.addEventListener('click',      makeFilterClick(btnWarm,      () => editor.applyOperation(applyWarm)));
    btnCool.addEventListener('click',      makeFilterClick(btnCool,      () => editor.applyOperation(applyCool)));
    btnVivid.addEventListener('click',     makeFilterClick(btnVivid,     () => editor.applyOperation(applyVividFilter)));
    btnFade.addEventListener('click',      makeFilterClick(btnFade,      () => editor.applyOperation(applyFade)));
    btnSharpen.addEventListener('click',   makeFilterClick(btnSharpen,   () => editor.applyOperation(applySharpenFilter)));
    btnNoise.addEventListener('click',     makeFilterClick(btnNoise,     () => editor.applyOperation(applyNoiseFilter)));

    // =========================================================
    // CUSTOM FILTER BUILDER
    // =========================================================
    const cfBrightnessSlider = document.getElementById('cf-brightness');
    const cfContrastSlider   = document.getElementById('cf-contrast');
    const cfSaturationSlider = document.getElementById('cf-saturation');
    const cfHueSlider        = document.getElementById('cf-hue');
    const cfBrightnessVal    = document.getElementById('cf-brightness-value');
    const cfContrastVal      = document.getElementById('cf-contrast-value');
    const cfSaturationVal    = document.getElementById('cf-saturation-value');
    const cfHueVal           = document.getElementById('cf-hue-value');
    const btnApplyCustom     = document.getElementById('btn-apply-custom-filter');
    const btnResetCustom     = document.getElementById('btn-reset-custom-filter');
    const cfPreview          = document.getElementById('custom-filter-preview');
    const cfPreviewLabel     = document.getElementById('custom-filter-preview-label');

    // Preview canvas inside the custom filter card
    const cfPreviewCanvas = document.createElement('canvas');
    cfPreviewCanvas.style.cssText = 'width:100%;height:100%;object-fit:cover;display:none;border-radius:6px;';
    cfPreview.appendChild(cfPreviewCanvas);

    function applyHueShift(imageData, degrees) {
        const d = new Uint8ClampedArray(imageData.data);
        const angle = degrees * Math.PI / 180;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        // Hue rotation matrix
        const m = [
            cos + (1-cos)/3,       (1-cos)/3 - sin*Math.sqrt(1/3), (1-cos)/3 + sin*Math.sqrt(1/3),
            (1-cos)/3 + sin*Math.sqrt(1/3), cos + (1-cos)/3,       (1-cos)/3 - sin*Math.sqrt(1/3),
            (1-cos)/3 - sin*Math.sqrt(1/3), (1-cos)/3 + sin*Math.sqrt(1/3), cos + (1-cos)/3
        ];
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i+1], b = d[i+2];
            d[i]   = Math.min(255, Math.max(0, m[0]*r + m[1]*g + m[2]*b));
            d[i+1] = Math.min(255, Math.max(0, m[3]*r + m[4]*g + m[5]*b));
            d[i+2] = Math.min(255, Math.max(0, m[6]*r + m[7]*g + m[8]*b));
        }
        return new ImageData(d, imageData.width, imageData.height);
    }

    function buildCustomFilterPreview() {
        if (!editor.imageLoaded) return;
        const b  = parseInt(cfBrightnessSlider.value);
        const c  = parseInt(cfContrastSlider.value);
        const s  = parseInt(cfSaturationSlider.value);
        const h  = parseInt(cfHueSlider.value);
        // Render at small size for speed
        const THUMB = 160;
        cfPreviewCanvas.width  = THUMB;
        cfPreviewCanvas.height = Math.round(THUMB * canvas.height / canvas.width);
        const ctx = cfPreviewCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, cfPreviewCanvas.width, cfPreviewCanvas.height);
        let data = ctx.getImageData(0, 0, cfPreviewCanvas.width, cfPreviewCanvas.height);
        if (b !== 0) data = applyBrightness(data, b);
        if (c !== 0) data = applyContrast(data, c);
        if (s !== 0) data = applySaturation(data, s);
        if (h !== 0) data = applyHueShift(data, h);
        ctx.putImageData(data, 0, 0);
        cfPreviewCanvas.style.display = 'block';
        if (cfPreviewLabel) cfPreviewLabel.style.display = 'none';
    }

    const debouncedCfPreview = debounce(buildCustomFilterPreview, 60);

    [cfBrightnessSlider, cfContrastSlider, cfSaturationSlider, cfHueSlider].forEach((sl, i) => {
        const vals = [cfBrightnessVal, cfContrastVal, cfSaturationVal, cfHueVal];
        sl.addEventListener('input', () => { vals[i].textContent = sl.value; debouncedCfPreview(); });
    });

    // Update preview whenever filters pane is opened
    editor.onChange(() => {
        if (activeTool === 'filters') debouncedCfPreview();
    });

    btnApplyCustom.addEventListener('click', () => {
        if (!editor.imageLoaded) return;
        commitPendingAdjustments();
        const b = parseInt(cfBrightnessSlider.value);
        const c = parseInt(cfContrastSlider.value);
        const s = parseInt(cfSaturationSlider.value);
        const h = parseInt(cfHueSlider.value);
        let data = editor.getImageData();
        if (b !== 0) data = applyBrightness(data, b);
        if (c !== 0) data = applyContrast(data, c);
        if (s !== 0) data = applySaturation(data, s);
        if (h !== 0) data = applyHueShift(data, h);
        editor.putImageData(data);
        editor.history.push(data);
        editor.baseImageData = editor.getImageData();
        editor._notifyChange();
        showAiFeedback('🎛️ Custom Look applied', null);
    });

    btnResetCustom.addEventListener('click', () => {
        cfBrightnessSlider.value = 0; cfBrightnessVal.textContent = '0';
        cfContrastSlider.value   = 0; cfContrastVal.textContent   = '0';
        cfSaturationSlider.value = 0; cfSaturationVal.textContent = '0';
        cfHueSlider.value        = 0; cfHueVal.textContent        = '0';
        debouncedCfPreview();
    });

    // =========================================================
    // RETOUCH BRUSH
    // =========================================================
    retouchModeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            retouchModeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            retouchMode = btn.dataset.retouch;
            const hints = { heal: 'Click or drag to heal spots and blemishes.', smooth: 'Click or drag to smooth out textures.', sharpen: 'Click or drag to sharpen details.' };
            if (retouchHint) retouchHint.textContent = hints[retouchMode] || '';
        });
    });

    retouchRadiusSlider.addEventListener('input', () => {
        retouchRadius = parseInt(retouchRadiusSlider.value);
        retouchRadiusValue.textContent = retouchRadius;
        if (retouchCursor) { retouchCursor.style.width = retouchRadius*2+'px'; retouchCursor.style.height = retouchRadius*2+'px'; }
    });
    retouchStrengthSlider.addEventListener('input', () => {
        retouchStrength = parseInt(retouchStrengthSlider.value);
        retouchStrengthValue.textContent = retouchStrength;
    });

    function activateRetouchTool() {
        retouchActive = true;
        canvas.style.cursor = 'none';
        canvas.addEventListener('mousedown', onRetouchStart);
        canvas.addEventListener('mousemove', onRetouchMove);
        canvas.addEventListener('mouseup',   onRetouchEnd);
        canvas.addEventListener('mouseleave',onRetouchEnd);
        canvas.addEventListener('mousemove', showRetouchCursor);
        if (retouchCursor) { retouchCursor.style.width = retouchRadius*2+'px'; retouchCursor.style.height = retouchRadius*2+'px'; }
        modeIndicatorText.textContent = 'Retouch Mode';
        modeIndicator.style.display   = 'flex';
    }

    function deactivateRetouchTool() {
        retouchActive = false;
        canvas.style.cursor = '';
        canvas.removeEventListener('mousedown', onRetouchStart);
        canvas.removeEventListener('mousemove', onRetouchMove);
        canvas.removeEventListener('mouseup',   onRetouchEnd);
        canvas.removeEventListener('mouseleave',onRetouchEnd);
        canvas.removeEventListener('mousemove', showRetouchCursor);
        if (retouchCursor) retouchCursor.style.display = 'none';
        modeIndicator.style.display = 'none';
    }

    function showRetouchCursor(e) {
        if (!retouchCursor) return;
        const canvasArea = document.getElementById('canvas-area');
        const areaRect   = canvasArea.getBoundingClientRect();
        retouchCursor.style.display = 'block';
        retouchCursor.style.left    = (e.clientX - areaRect.left) + 'px';
        retouchCursor.style.top     = (e.clientY - areaRect.top)  + 'px';
    }

    function applyRetouchAt(cx, cy) {
        if (!editor.imageLoaded) return;
        const rect   = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = Math.round((cx - rect.left) * scaleX);
        const y = Math.round((cy - rect.top)  * scaleY);
        const r = retouchRadius;
        const str = retouchStrength / 100;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(Math.max(0,x-r), Math.max(0,y-r), r*2, r*2);

        if (retouchMode === 'heal' || retouchMode === 'smooth') {
            // Simple box-blur within the radius
            const d = imageData.data, w = imageData.width, h = imageData.height;
            const tmp = new Uint8ClampedArray(d);
            for (let py = 1; py < h - 1; py++) {
                for (let px = 1; px < w - 1; px++) {
                    for (let c = 0; c < 3; c++) {
                        const avg = (
                            tmp[(py-1)*w*4+(px-1)*4+c] + tmp[(py-1)*w*4+px*4+c] + tmp[(py-1)*w*4+(px+1)*4+c] +
                            tmp[py*w*4+(px-1)*4+c]     + tmp[py*w*4+px*4+c]     + tmp[py*w*4+(px+1)*4+c] +
                            tmp[(py+1)*w*4+(px-1)*4+c] + tmp[(py+1)*w*4+px*4+c] + tmp[(py+1)*w*4+(px+1)*4+c]
                        ) / 9;
                        const idx = py*w*4+px*4+c;
                        d[idx] = Math.round(d[idx] * (1 - str) + avg * str);
                    }
                }
            }
            ctx.putImageData(imageData, Math.max(0,x-r), Math.max(0,y-r));
        } else if (retouchMode === 'sharpen') {
            const result = applySharpenFilter(imageData);
            const d = imageData.data, s = result.data;
            for (let i = 0; i < d.length; i += 4) {
                for (let c = 0; c < 3; c++) d[i+c] = Math.round(d[i+c]*(1-str) + s[i+c]*str);
            }
            ctx.putImageData(imageData, Math.max(0,x-r), Math.max(0,y-r));
        }
    }

    function onRetouchStart(e) { retouchPainting = true; applyRetouchAt(e.clientX, e.clientY); }
    function onRetouchMove(e)  { if (retouchPainting) applyRetouchAt(e.clientX, e.clientY); }
    function onRetouchEnd()    {
        if (retouchPainting) {
            retouchPainting = false;
            editor.history.push(editor.getImageData());
            editor.baseImageData = editor.getImageData();
            editor._notifyChange();
        }
    }

    // =========================================================
    // AI FILTER
    // =========================================================
    const AI_FILTERS = [
        { name:'Grayscale', rawFn:grayscale, rawArgs:[],  reason:'Low colour variance detected.',  effect:'Removes all colour.', confidence:'87%' },
        { name:'Sepia',     rawFn:sepia,     rawArgs:[],  reason:'Warm tones present.',             effect:'Warm brownish tone.',  confidence:'74%' },
        { name:'Invert',    rawFn:invert,    rawArgs:[],  reason:'High contrast detected.',         effect:'Flips colours.',       confidence:'61%' },
        { name:'Blur',      rawFn:blur,      rawArgs:[3], reason:'High noise detected.',            effect:'Soft blur.',           confidence:'79%' },
    ];

    const filterAiResult       = document.getElementById('filter-ai-result');
    const filterAiAppliedLabel = document.getElementById('filter-ai-applied-label');

    // =========================================================
    // AI FEEDBACK TOAST
    // =========================================================
    const aiFeedbackToast   = document.getElementById('ai-feedback-toast');
    const aiFeedbackLabelEl = document.getElementById('ai-feedback-label');
    const aiFbUp            = document.getElementById('ai-fb-up');
    const aiFbDown          = document.getElementById('ai-fb-down');
    const aiFbUndo          = document.getElementById('ai-fb-undo');
    const aiFbClose         = document.getElementById('ai-fb-close');
    const aiFeedbackThanks  = document.getElementById('ai-feedback-thanks');
    const aiFeedbackThanksText = document.getElementById('ai-feedback-thanks-text');

    let aiFbAutoDismiss = null;
    let aiFbUndoSnapshot = null; // imageData to undo to

    const MOTIVATIONS = [
        'Help us improve — was this good?',
        'Your rating shapes future AI suggestions ✨',
        '2 taps = better AI for everyone 🙌',
        'Did the AI nail it? Let us know!',
        'Quick rating? It really helps us 💪',
    ];

    function showAiFeedback(label, undoFn) {
        aiFbUndoSnapshot = undoFn || null;
        aiFbUp.classList.remove('selected-up');
        aiFbDown.classList.remove('selected-down');
        aiFeedbackThanks.style.display = 'none';
        // Hide undo by default — only shown on thumbs-down
        aiFbUndo.style.display = 'none';

        aiFeedbackLabelEl.textContent = label;
        const sub = aiFeedbackToast.querySelector('.ai-feedback-sub');
        if (sub) sub.textContent = MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];

        aiFeedbackToast.classList.add('visible');
        clearTimeout(aiFbAutoDismiss);
        aiFbAutoDismiss = setTimeout(() => dismissAiFeedback(false), 10000);
    }

    function dismissAiFeedback(withThanks) {
        clearTimeout(aiFbAutoDismiss);
        if (withThanks) {
            aiFeedbackThanks.style.display = 'block';
            setTimeout(() => {
                aiFeedbackToast.classList.remove('visible');
                setTimeout(() => { aiFeedbackThanks.style.display = 'none'; }, 400);
            }, 1400);
        } else {
            aiFeedbackToast.classList.remove('visible');
        }
    }

    aiFbUp.addEventListener('click', () => {
        aiFbUp.classList.add('selected-up');
        aiFbDown.classList.remove('selected-down');
        aiFbUndo.style.display = 'none';
        aiFeedbackThanksText.textContent = 'Great to hear! 🌟 Thanks for the thumbs up!';
        dismissAiFeedback(true);
    });

    aiFbDown.addEventListener('click', () => {
        aiFbDown.classList.add('selected-down');
        aiFbUp.classList.remove('selected-up');
        // Reveal undo button only on thumbs-down
        aiFbUndo.style.display = '';
        aiFeedbackThanksText.textContent = 'Noted! 🙏 We\'ll use this to improve.';
        // Don't auto-dismiss yet — let user decide to undo or close
        clearTimeout(aiFbAutoDismiss);
    });

    aiFbClose.addEventListener('click', () => dismissAiFeedback(false));

    aiFbUndo.addEventListener('click', () => {
        editor.undo();
        resetSliders();
        clearActiveFilter();
        if (filterAiResult) filterAiResult.style.display = 'none';
        aiFeedbackThanksText.textContent = '↩️ Undone! We\'ll work on making it better.';
        dismissAiFeedback(true);
    });

    function triggerAiFilter(chosenName) {
        if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }
        const chosen = chosenName ? AI_FILTERS.find(f => f.name === chosenName) : AI_FILTERS[3];
        if (!chosen) return;
        setTimeout(() => {
            const result = chosen.rawFn(editor.getImageData(), ...(chosen.rawArgs || []));
            editor.putImageData(result);
            editor.history.push(result);
            editor.baseImageData = editor.getImageData();
            editor._notifyChange();
            if (filterAiAppliedLabel) filterAiAppliedLabel.textContent = `✅ Applied: ${chosen.name}`;
            if (filterAiResult)       filterAiResult.style.display = 'flex';
            showAiFeedback(`🤖 AI Filter: ${chosen.name}`, () => { editor.undo(); resetSliders(); });
        }, 600);
    }


    // =========================================================
    // AI TOOLS PANEL BUTTONS
    // =========================================================
    function aiOverallEnhance() {
        if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }
        commitPendingAdjustments();
        brightnessSlider.value=15; brightnessValue.textContent='15';
        contrastSlider.value=20;   contrastValue.textContent='20';
        saturationSlider.value=10; saturationValue.textContent='10';
        applyAllAdjustments(); editor.commitAdjustment(); resetSliders();
        showAiFeedback('🪄 AI Edit Everything applied', null);
    }

    if (btnAiOverall)    btnAiOverall.addEventListener('click', aiOverallEnhance);
    if (btnAiAdjustCat)  btnAiAdjustCat.addEventListener('click',  () => handleAiAction('auto-enhance'));
    if (btnAiFilterCat)  btnAiFilterCat.addEventListener('click',  () => triggerAiFilter('Blur'));
    if (btnAiCropCat)    btnAiCropCat.addEventListener('click',    () => showSnackbar('✂️ AI Crop suggestion (integration needed)'));
    if (btnAiRetouchCat) btnAiRetouchCat.addEventListener('click', () => handleAiAction('auto-heal'));

    // =========================================================
    // AI PANEL ACTIONS (extended)
    // =========================================================
    function handleAiAction(action) {
        if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }
        switch (action) {
            case 'auto-enhance':
                commitPendingAdjustments();
                brightnessSlider.value=15; brightnessValue.textContent='15';
                contrastSlider.value=20;   contrastValue.textContent='20';
                saturationSlider.value=10; saturationValue.textContent='10';
                applyAllAdjustments(); editor.commitAdjustment(); resetSliders();
                showAiFeedback('✨ AI Auto Enhance applied', null);
                break;
            case 'boost-brightness':
                commitPendingAdjustments();
                brightnessSlider.value=30; brightnessValue.textContent='30';
                applyAllAdjustments(); editor.commitAdjustment(); resetSliders();
                showAiFeedback('☀️ AI Brightness Boost applied', null);
                break;
            case 'vivid':
                commitPendingAdjustments();
                saturationSlider.value=40; saturationValue.textContent='40';
                applyAllAdjustments(); editor.commitAdjustment(); resetSliders();
                showAiFeedback('🎨 AI Vivid Colours applied', null);
                break;
            case 'ai-filter': triggerAiFilter('Blur'); break;
            case 'suggest-grayscale':
                commitPendingAdjustments(); editor.applyOperation(grayscale);
                showAiFeedback('🖤 AI Grayscale Filter applied', null); break;
            case 'suggest-sepia':
                commitPendingAdjustments(); editor.applyOperation(sepia);
                showAiFeedback('🟤 AI Sepia Filter applied', null); break;
            case 'auto-heal': {
                const result = blur(editor.getImageData(), 1);
                editor.putImageData(result); editor.history.push(result);
                editor.baseImageData = editor.getImageData(); editor._notifyChange();
                showAiFeedback('🩹 AI Auto Heal applied', null); break;
            }
            case 'portrait-smooth': {
                const result = blur(editor.getImageData(), 2);
                editor.putImageData(result); editor.history.push(result);
                editor.baseImageData = editor.getImageData(); editor._notifyChange();
                showAiFeedback('🌊 AI Portrait Smooth applied', null); break;
            }
            case 'smart-inpaint':
            case 'detect-objects': showSnackbar('🔍 AI object detection (integration needed)'); break;
            case 'crop-thirds': case 'crop-square': case 'auto-straighten':
                showSnackbar(`🤖 "${action}" (AI integration needed)`); break;
            case 'suggest-caption': showSnackbar('💬 Caption suggestion (AI integration needed)'); break;
            case 'contrast-check':  showSnackbar('🎨 Contrast check (AI integration needed)'); break;
            default: showSnackbar(`🤖 "${action}" (AI integration needed)`);
        }
    }

    // =========================================================
    // ADD / REMOVE OBJECTS
    // =========================================================
    annotationLayer.setTool('rectangle');

    function updateObjectsUI() {
        if (objectsMode === 'add') {
            btnModeAdd.classList.add('active'); btnModeRemove.classList.remove('active');
            addObjectInputDiv.style.display = 'flex'; removeObjectActionsDiv.style.display = 'none';
            objectsInstructionText.textContent = 'Draw a rectangle where you want to add an object.';
        } else {
            btnModeAdd.classList.remove('active'); btnModeRemove.classList.add('active');
            addObjectInputDiv.style.display = 'none'; removeObjectActionsDiv.style.display = 'flex';
            objectsInstructionText.textContent = 'Draw a rectangle around the object to remove.';
        }
    }

    btnModeAdd.addEventListener('click',    () => { objectsMode = 'add';    updateObjectsUI(); });
    btnModeRemove.addEventListener('click', () => { objectsMode = 'remove'; updateObjectsUI(); });

    objectPromptInput.addEventListener('input', () => {
        const hasText = objectPromptInput.value.trim().length > 0;
        const hasSel  = annotationLayer.annotations.filter(a => !a.hidden).length > 0;
        btnGenerateObject.disabled = !hasText || !hasSel;
    });

    annotationLayer.onChange(() => {
        const hasSel = annotationLayer.annotations.filter(a => !a.hidden).length > 0;
        btnClearSelection.disabled = !hasSel;
        btnRemoveObject.disabled   = !hasSel;
        btnGenerateObject.disabled = !hasSel || !objectPromptInput.value.trim();
    });

    btnClearSelection.addEventListener('click', () => { annotationLayer.clearAll(); showSnackbar('Selection cleared'); });

    btnGenerateObject.addEventListener('click', () => {
        if (!editor.imageLoaded) return;
        const prompt = objectPromptInput.value.trim(); if (!prompt) return;
        btnGenerateObject.disabled = true; btnGenerateObject.textContent = '⏳ Generating…';
        setTimeout(() => {
            showSnackbar(`✨ "${prompt}" generation (AI integration needed)`);
            btnGenerateObject.disabled = false; btnGenerateObject.textContent = '✨ Generate Object';
            objectPromptInput.value = ''; annotationLayer.clearAll();
        }, 1500);
    });

    btnRemoveObject.addEventListener('click', () => {
        if (!editor.imageLoaded) return;
        btnRemoveObject.disabled = true; btnRemoveObject.textContent = '⏳ Removing…';
        setTimeout(() => {
            showSnackbar('🗑️ Object removal (AI integration needed)');
            btnRemoveObject.disabled = false; btnRemoveObject.textContent = '🗑️ Remove Selected Area';
            annotationLayer.clearAll();
        }, 1500);
    });

    editor.onChange(() => {
        if (editor.imageLoaded && !annotationLayer.active) annotationLayer.activate();
    });

    // =========================================================
    // FLOATING AI CHATBOT
    // =========================================================
    const chatResponses = {
        'hello': 'Hello! How can I help you with your photo editing?',
        'hi':    'Hi! Ask me anything about editing your photo.',
        'help':  'I can help with:\n• Crop & Transform\n• Adjust (brightness, contrast, saturation, exposure)\n• Filters (grayscale, sepia, warm, cool, blur, sharpen…)\n• Retouch brush (heal, smooth, sharpen)\n• Objects (add/remove)\n• AI Tools\n• Text overlay',
        'brightness': 'Open Adjust (🎨) and drag the Brightness slider right to lighten.',
        'contrast':   'Open Adjust (🎨) — Contrast makes darks darker and lights lighter.',
        'saturation': 'Open Adjust (🎨) — Saturation right = vivid, left = muted.',
        'exposure':   'Open Adjust (🎨) — Exposure is like overall brightness for the whole image.',
        'highlights': 'Open Adjust (🎨) — Highlights controls the very bright areas.',
        'shadows':    'Open Adjust (🎨) — Shadows controls the dark areas.',
        'filter':     'Open Filters (✨) — try Warm, Cool, Vivid, Fade, Blur, Sharpen…',
        'blur':       'Open Filters (✨), adjust the Blur Intensity slider, then click Blur.',
        'sharpen':    'Open Filters (✨) and click Sharpen, or use Retouch in Sharpen mode.',
        'crop':       'Click Crop (✂️), click "Start Crop", drag a rectangle, then Apply.',
        'rotate':     'Crop tool → Rotate CW / CCW buttons.',
        'flip':       'Crop tool → Flip H or Flip V.',
        'retouch':    'Open Retouch (🪄), choose Heal/Smooth/Sharpen, set radius, then paint on the image.',
        'heal':       'Retouch → Heal mode smooths out blemishes and spots.',
        'radius':     'In Retouch, use the Brush Radius slider to change how wide the brush is.',
        'add':        'Open Objects (🎯), choose Add, draw a rectangle, type what to add, click Generate.',
        'remove':     'Open Objects (🎯), choose Remove, draw a rectangle, click Remove.',
        'ai':         'Open AI Tools (🤖) — click AI Edit Everything for a full auto-enhance.',
        'compare':    'Hold the 👁 Compare button in the toolbar to see the original image.',
        'undo':       'Ctrl+Z or click ↩️.',
        'redo':       'Ctrl+Shift+Z or click ↪️.',
        'save':       'Click 💾 Save to download your edited photo.',
        'reset':      'Click 🔄 Reset to go back to the original.',
        'text':       'Click the Text tool (T), set size & colour, then click on the canvas.',
    };

    function getBotResponse(msg) {
        const lower = msg.toLowerCase();
        for (const [key, resp] of Object.entries(chatResponses)) {
            if (lower.includes(key)) return resp;
        }
        return "I'm not sure about that. Try asking about: filters, crop, blur, retouch, add/remove objects, AI tools, compare, undo/redo, save, or reset.";
    }

    function addChatMessage(text, isUser = false) {
        const div = document.createElement('div');
        div.className = `chat-message ${isUser ? 'user' : 'bot'}`;
        div.innerHTML = `<span class="chat-avatar">${isUser ? '👤' : '🤖'}</span><div class="chat-bubble">${text.replace(/\n/g, '<br>')}</div>`;
        chatbotMessages.appendChild(div);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    function showTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'chat-message bot';
        div.innerHTML = `<span class="chat-avatar">🤖</span><div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
        chatbotMessages.appendChild(div);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
        return div;
    }

    function sendChatMessage() {
        const msg = chatbotInput.value.trim(); if (!msg) return;
        addChatMessage(msg, true);
        chatbotInput.value = '';
        const typing = showTypingIndicator();
        setTimeout(() => { typing.remove(); addChatMessage(getBotResponse(msg)); }, 700 + Math.random() * 400);
    }

    chatbotSend.addEventListener('click', sendChatMessage);
    chatbotInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });

    chatbotBubble.addEventListener('click', () => {
        const isOpen = chatbotFloat.classList.toggle('open');
        chatbotBubble.classList.toggle('open', isOpen);
        if (isOpen) chatbotInput.focus();
    });
    chatbotFloatClose.addEventListener('click', () => {
        chatbotFloat.classList.remove('open');
        chatbotBubble.classList.remove('open');
    });

    // =========================================================
    // TEXT TOOL
    // =========================================================
    textSizeSlider.addEventListener('input', () => {
        textSize = parseInt(textSizeSlider.value);
        textSizeValue.textContent = textSize;
    });

    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            colorSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            textColor = swatch.dataset.color;
        });
    });

    function activateTextTool() {
        textToolActive = true;
        canvas.style.cursor = 'text';
        canvas.addEventListener('click', onCanvasTextClick);
        modeIndicatorText.textContent = 'Text Mode';
        modeIndicator.style.display = 'flex';
    }

    function deactivateTextTool() {
        textToolActive = false;
        canvas.style.cursor = '';
        canvas.removeEventListener('click', onCanvasTextClick);
        modeIndicator.style.display = 'none';
    }

    function onCanvasTextClick(e) {
        if (!editor.imageLoaded) return;
        const text = prompt('Enter text:');
        if (!text || !text.trim()) return;
        const rect   = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top)  * scaleY;
        commitPendingAdjustments();
        const ctx = canvas.getContext('2d');
        ctx.font      = `bold ${textSize}px 'Segoe UI', sans-serif`;
        ctx.fillStyle = textColor;
        ctx.fillText(text.trim(), x, y);
        editor.history.push(editor.getImageData());
        editor.baseImageData = editor.getImageData();
        editor._notifyChange();
        showSnackbar('✏️ Text added');
    }

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
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            commitPendingAdjustments();
            if (e.shiftKey) editor.redo(); else editor.undo();
            resetSliders(); annotationLayer.syncSize();
        }
        if (e.key === 'Escape') closeTool();
    });

    // =========================================================
    // DOWNLOAD & RESET
    // =========================================================
    btnDownload.addEventListener('click', withCommitWrap(() => withTip('btn-download', () => {
        if (!editor.imageLoaded) return;
        const merged = annotationLayer.flattenOnto(canvas);
        downloadDataURL(merged.toDataURL('image/png'), 'edited-image.png');
    })));

    btnReset.addEventListener('click', () => withTip('btn-reset', () => {
        if (!editor.originalImage) return;
        const img = editor.originalImage;
        let w = img.width, h = img.height;
        const MAX = 4000;
        if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w = Math.round(w*r); h = Math.round(h*r); }
        canvas.width = w; canvas.height = h;
        editor.ctx.drawImage(img, 0, 0, w, h);
        editor.history.clear();
        editor.history.push(editor.getImageData());
        editor.baseImageData = editor.getImageData();
        adjustmentsDirty = false;
        resetSliders();
        // Reset custom filter sliders
        if (cfBrightnessSlider) { cfBrightnessSlider.value=0; cfBrightnessVal.textContent='0'; }
        if (cfContrastSlider)   { cfContrastSlider.value=0;   cfContrastVal.textContent='0'; }
        if (cfSaturationSlider) { cfSaturationSlider.value=0; cfSaturationVal.textContent='0'; }
        if (cfHueSlider)        { cfHueSlider.value=0;        cfHueVal.textContent='0'; }
        // Clear active filter badge
        clearActiveFilter();
        // Hide AI feedback toast if showing
        dismissAiFeedback(false);
        annotationLayer.clearAll();
        annotationLayer.syncSize();
        editor._notifyChange();
        showSnackbar('🔄 Reset to original');
    }));

    // =========================================================
    // UI STATE
    // =========================================================
    editor.onChange(() => {
        btnUndo.disabled = !editor.history.canUndo();
        btnRedo.disabled = !editor.history.canRedo();
    });

    btnUndo.disabled = true;
    btnRedo.disabled = true;

    // =========================================================
    // APP FEEDBACK MODAL (rail button)
    // =========================================================
    const railFeedbackBtn    = document.getElementById('rail-feedback-btn');
    const appFeedbackOverlay = document.getElementById('app-feedback-overlay');
    const appFbStars         = document.getElementById('app-fb-stars');
    const appFbText          = document.getElementById('app-fb-text');
    const appFbCancel        = document.getElementById('app-fb-cancel');
    const appFbSubmit        = document.getElementById('app-fb-submit');
    let appFbRating = 0;

    if (railFeedbackBtn) {
        railFeedbackBtn.addEventListener('click', () => {
            appFbRating = 0;
            appFbText.value = '';
            appFeedbackOverlay.querySelectorAll('.star-btn').forEach(s => s.classList.remove('active'));
            appFeedbackOverlay.style.display = 'flex';
        });
    }

    if (appFbStars) {
        appFbStars.addEventListener('click', (e) => {
            const star = e.target.closest('.star-btn');
            if (!star) return;
            appFbRating = parseInt(star.dataset.star);
            appFbStars.querySelectorAll('.star-btn').forEach(s => {
                s.classList.toggle('active', parseInt(s.dataset.star) <= appFbRating);
            });
        });
        // Hover preview
        appFbStars.addEventListener('mouseover', (e) => {
            const star = e.target.closest('.star-btn');
            if (!star) return;
            const n = parseInt(star.dataset.star);
            appFbStars.querySelectorAll('.star-btn').forEach(s => {
                s.style.filter = parseInt(s.dataset.star) <= n ? 'grayscale(0) opacity(1)' : 'grayscale(1) opacity(.4)';
            });
        });
        appFbStars.addEventListener('mouseleave', () => {
            appFbStars.querySelectorAll('.star-btn').forEach(s => {
                s.style.filter = s.classList.contains('active') ? 'grayscale(0) opacity(1)' : 'grayscale(1) opacity(.4)';
            });
        });
    }

    if (appFbCancel) appFbCancel.addEventListener('click', () => { appFeedbackOverlay.style.display = 'none'; });
    if (appFbSubmit) appFbSubmit.addEventListener('click', () => {
        appFeedbackOverlay.style.display = 'none';
        const stars = appFbRating > 0 ? '⭐'.repeat(appFbRating) : '';
        showSnackbar(appFbRating >= 4 ? `${stars} Thank you so much! 🎉` : appFbRating > 0 ? `${stars} Thanks — we'll keep improving! 💪` : '🙏 Thanks for the feedback!');
    });
});
