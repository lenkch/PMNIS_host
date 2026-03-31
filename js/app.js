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
    // WELCOME / ROLE SCREEN — wire buttons FIRST before anything can crash
    // =========================================================
    const welcomeScreen = document.getElementById('welcome-screen');
    let currentRole = 'pro';

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
    // REST OF APP SETUP

    // Guided tour — each tool section has LEFT pane popup then RIGHT panel popup
    // sub:0 = left pane, sub:1 = right AI panel
    const TOUR_STEPS = [
        {
            targetId: 'pane-crop',    aiId: 'ai-panel', tool: 'crop',
            leftTitle: '✂️ Crop & Transform', leftText: 'Crop your photo to any area, or rotate and flip it. Click "Start Crop", drag on the image, then Apply.',
            rightTitle: 'AI Panel — available everywhere',
            rightText: 'Each section has an AI panel on the right like this one. It offers smart suggestions specific to that tool — from auto-enhancing adjustments to picking filters, suggesting crops, healing blemishes or removing objects. Look for it whenever you want a helping hand.'
        },
        {
            targetId: 'pane-adjust',  aiId: 'ai-panel', tool: 'adjust',
            leftTitle: '🎨 Adjustments',  leftText: 'Drag sliders for brightness, contrast, saturation, exposure, highlights and shadows. Changes are previewed live.',
            rightTitle: null, rightText: null
        },
        {
            targetId: 'pane-filters', aiId: 'ai-panel', tool: 'filters',
            leftTitle: '✨ Filters',       leftText: 'Apply colour styles (Warm, Sepia…) or effects (Blur, Sharpen…). After applying, drag the Intensity slider to control strength.',
            rightTitle: null, rightText: null
        },
        {
            targetId: 'pane-retouch', aiId: 'ai-panel', tool: 'retouch',
            leftTitle: '🪄 Retouch',       leftText: 'Paint on the image to heal blemishes, smooth skin, or sharpen details. A circle cursor shows your brush size as you hover.',
            rightTitle: null, rightText: null
        },
        {
            targetId: 'pane-objects', aiId: 'ai-panel', tool: 'objects',
            leftTitle: '🗑️ Remove Objects', leftText: 'Select Rectangle, Ellipse or Freehand, draw around objects you want removed, then click Remove. You can mark multiple areas at once.',
            rightTitle: null, rightText: null
        },
        {
            targetId: 'pane-ai',     aiId: null,        tool: 'ai',
            leftTitle: '✦ AI Tools',      leftText: '"AI Edit Everything" improves your whole photo in one click. Or pick a specific AI action — Adjust, Filter, Crop or Retouch.',
            rightTitle: null, rightText: null
        },
        {
            targetId: 'pane-text',   aiId: 'ai-panel', tool: 'text',
            leftTitle: 'T Text & Add Objects', leftText: 'Click on the image to place styled text. Or describe an object below and let AI generate and insert it into your photo.',
            rightTitle: null, rightText: null
        },
        {
            targetId: 'btn-undo',    aiId: null,        tool: null,
            leftTitle: '↩️ Undo & Redo',   leftText: 'Made a mistake? Undo steps back one change. Redo brings it forward. Shortcut: Ctrl+Z / Ctrl+Shift+Z.',
            rightTitle: null, rightText: null
        },
        {
            targetId: 'btn-download', aiId: null,       tool: null,
            leftTitle: '💾 Save',          leftText: 'Happy with the result? Click Save to download your edited photo as a PNG file.',
            rightTitle: null, rightText: null
        },
    ];

    // tourSubStep: 0 = showing left popup, 1 = showing right popup (when aiId exists)
    let tourSubStep = 0;

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
        // Clear previous left-panel highlight
        if (tourHighlightEl) tourHighlightEl.classList.remove('tour-highlight');
        // Always clear previous AI panel highlight too
        const prevAi = document.getElementById('ai-panel');
        if (prevAi) prevAi.classList.remove('tour-highlight');
        const el = id ? document.getElementById(id) : null;
        if (el) { el.classList.add('tour-highlight'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        tourHighlightEl = el;
    }

    function positionTourPopup(targetId) {
        const popup = tourOverlay.querySelector('.tour-popup');
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) {
            popup.style.left = '50%'; popup.style.top = '50%';
            popup.style.transform = 'translate(-50%,-50%)';
            return;
        }
        popup.style.transform = '';
        const rect   = target.getBoundingClientRect();
        const pw = 420, ph = 260, m = 14;
        const spaceLeft   = rect.left;
        const spaceRight  = window.innerWidth - rect.right;
        const spaceBottom = window.innerHeight - rect.bottom;

        let left, top;

        if (spaceLeft >= pw + m) {
            // Prefer left of target (good for right-side panels like AI panel)
            left = rect.left - pw - m;
            top  = rect.top + 30;
        } else if (spaceRight >= pw + m) {
            // Right of target
            left = rect.right + m;
            top  = rect.top + 30;
        } else if (spaceBottom >= ph + m) {
            // Below target
            left = rect.left;
            top  = rect.bottom + m;
        } else {
            // Above target
            left = rect.left;
            top  = rect.top - ph - m;
        }

        // Always clamp fully within viewport
        left = Math.max(m, Math.min(left, window.innerWidth  - pw - m));
        top  = Math.max(m, Math.min(top,  window.innerHeight - ph - m));

        popup.style.left = left + 'px';
        popup.style.top  = top  + 'px';
    }

    function totalSubSteps() {
        return TOUR_STEPS.reduce((n, s) => n + (s.aiId && s.rightTitle ? 2 : 1), 0);
    }
    function globalSubStepIndex(step, sub) {
        let idx = 0;
        for (let i = 0; i < step; i++) idx += (TOUR_STEPS[i].aiId && TOUR_STEPS[i].rightTitle ? 2 : 1);
        return idx + sub;
    }

    // Spotlight overlay — a fixed full-screen dark layer with a transparent "hole" cut out
    const tourSpotlight = document.createElement('div');
    tourSpotlight.id = 'tour-spotlight';
    tourSpotlight.style.cssText = `
        position:fixed; inset:0; z-index:2450; pointer-events:none;
        transition: opacity 0.3s ease;
        opacity:0;
    `;
    document.body.appendChild(tourSpotlight);

    function updateSpotlight(targetEl) {
        if (!targetEl) { tourSpotlight.style.opacity = '0'; return; }
        const r = targetEl.getBoundingClientRect();
        const pad = 8;
        const x = r.left - pad, y = r.top - pad;
        const w = r.width + pad * 2, h = r.height + pad * 2;
        tourSpotlight.style.background = `
            radial-gradient(ellipse at ${x + w/2}px ${y + h/2}px, transparent ${Math.max(w,h)*0.55}px, rgba(0,0,0,0.72) ${Math.max(w,h)*0.56}px)
        `;
        // Fallback using SVG clip mask for sharp rectangular cutout
        tourSpotlight.style.background = '';
        tourSpotlight.style.backgroundColor = 'transparent';
        // Use box-shadow trick on a pseudo via an inline SVG mask
        const svgMask = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='${window.innerWidth}' height='${window.innerHeight}'><defs><mask id='m'><rect width='100%' height='100%' fill='white'/><rect x='${x}' y='${y}' width='${w}' height='${h}' rx='6' fill='black'/></mask></defs><rect width='100%' height='100%' fill='rgba(0,0,0,0.68)' mask='url(%23m)'/></svg>")`;
        tourSpotlight.style.backgroundImage = svgMask;
        tourSpotlight.style.backgroundRepeat = 'no-repeat';
        tourSpotlight.style.backgroundSize = '100% 100%';
        tourSpotlight.style.opacity = '1';
    }

    function clearSpotlight() {
        tourSpotlight.style.opacity = '0';
    }

    // Open a tool during tour without toggling it closed if already open
    function openToolForTour(tool) {
        if (!tool || typeof openTool !== 'function') return;
        // If this tool is already active, just make sure panels are open
        if (activeTool === tool) {
            toolPanel.classList.add('open');
            const aiContent = AI_PANEL_CONTENT[tool];
            if (aiContent) aiPanel.classList.add('open');
            return;
        }
        openTool(tool);
    }

    function showTourStep(step, sub) {
        tourStep = step;
        tourSubStep = sub;
        const s = TOUR_STEPS[step];
        const isRight = sub === 1 && s.aiId && s.rightTitle;
        const title = isRight ? s.rightTitle : s.leftTitle;
        const text  = isRight ? s.rightText  : s.leftText;
        const total = totalSubSteps();
        const cur   = globalSubStepIndex(step, sub) + 1;

        document.getElementById('tour-title').textContent = title;
        document.getElementById('tour-text').textContent  = text;
        document.getElementById('tour-counter').textContent = `${cur} / ${total}`;
        document.getElementById('tour-progress-bar').style.width = `${(cur / total) * 100}%`;

        const isFirst = step === 0 && sub === 0;
        const isLast  = step === TOUR_STEPS.length - 1 && sub === (s.aiId && s.rightTitle ? 1 : 0);
        document.getElementById('tour-back').style.visibility = isFirst ? 'hidden' : 'visible';
        document.getElementById('tour-next').textContent = isLast ? 'Finish ✓' : 'Next →';
        document.getElementById('tour-skip').style.display = isLast ? 'none' : '';

        tourOverlay.classList.remove('hidden');
        if (tourBlocker) tourBlocker.classList.remove('hidden');

        // Open tool panels without risk of toggling them closed
        openToolForTour(s.tool);

        // Clear all highlights first
        document.querySelectorAll('.tour-highlight, .tour-highlight-soft').forEach(el => {
            el.classList.remove('tour-highlight', 'tour-highlight-soft');
        });
        tourHighlightEl = null;

        // Small delay so panels have time to open/animate before we measure
        setTimeout(() => {
            let targetEl = null;
            if (isRight) {
                targetEl = document.getElementById(s.aiId);
                if (targetEl) { targetEl.classList.add('tour-highlight'); tourHighlightEl = targetEl; }
                positionTourPopup(s.aiId);
            } else {
                targetEl = document.getElementById(s.targetId);
                if (targetEl) {
                    targetEl.classList.add('tour-highlight');
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    tourHighlightEl = targetEl;
                }
                positionTourPopup(s.targetId);
                // Always softly highlight the AI panel when this section has one
                if (s.aiId) {
                    const aiEl = document.getElementById(s.aiId);
                    if (aiEl) aiEl.classList.add('tour-highlight-soft');
                }
            }
            updateSpotlight(targetEl);
        }, 320);
    }

    function endTour() {
        tourOverlay.classList.add('hidden');
        if (tourBlocker) tourBlocker.classList.add('hidden');
        clearSpotlight();
        document.querySelectorAll('.tour-highlight, .tour-highlight-soft').forEach(el => {
            el.classList.remove('tour-highlight', 'tour-highlight-soft');
        });
        tourHighlightEl = null;
        tourDone = true;
    }

    document.getElementById('tour-next').addEventListener('click', () => {
        const s = TOUR_STEPS[tourStep];
        const hasRight = s.aiId && s.rightTitle;
        if (tourSubStep === 0 && hasRight) {
            showTourStep(tourStep, 1);
        } else if (tourStep < TOUR_STEPS.length - 1) {
            showTourStep(tourStep + 1, 0);
        } else {
            endTour();
        }
    });

    document.getElementById('tour-back').addEventListener('click', () => {
        if (tourSubStep === 1) {
            showTourStep(tourStep, 0);
        } else if (tourStep > 0) {
            const prev = TOUR_STEPS[tourStep - 1];
            showTourStep(tourStep - 1, (prev.aiId && prev.rightTitle) ? 1 : 0);
        }
    });

    document.getElementById('tour-skip').addEventListener('click', endTour);


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

    // Objects pane — vars wired later in REMOVE OBJECTS section

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
        objects: 'Remove Objects',
        ai:      'AI Tools',
        text:    'Text & Add Objects',
    };

    const AI_PANEL_CONTENT = {
        crop: {
            title: 'AI Crop',
            html: `
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">Crop along the rule-of-thirds grid for a more balanced composition.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="crop-thirds">✂️ Rule of Thirds</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">Crop to a 1:1 square — perfect for social media.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="crop-square">🔲 Square Crop</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">AI detected the horizon is slightly tilted — auto-rotate to straighten.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="auto-straighten">🔄 Auto Straighten</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">Error AI suggestion.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="ai-smart-crop">Error Suggestion
                    </button>
                </div>`
        },
        adjust: {
            title: 'AI Adjust',
            html: `
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-intro">Based on recent trends, I suggest these changes:</div>
                    <ul class="ai-suggestion-list">
                        <li>☀️ <strong>Brightness +30</strong> — image appears underexposed</li>
                        <li>🎨 <strong>Saturation +40</strong> — vivid colours are trending in portrait photography</li>
                    </ul>
                    <button class="ai-suggestion-apply w-full" data-ai-action="auto-enhance">✨ Apply Suggestions</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-intro">For a clean, timeless look I suggest:</div>
                    <ul class="ai-suggestion-list">
                        <li>◑ <strong>Contrast +20</strong> — adds depth and definition</li>
                        <li>🌤 <strong>Highlights −15</strong> — recover blown-out areas</li>
                    </ul>
                    <button class="ai-suggestion-apply w-full" data-ai-action="boost-brightness">Apply Suggestions</button>
                </div>`
        },
        filters: {
            title: 'AI Filters',
            html: `
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-intro">Based on recent trends, I suggest these filters:</div>
                    <ul class="ai-suggestion-list">
                        <li>🖤 <strong>Grayscale</strong> — low colour variance detected, B&W will improve impact</li>
                        <li>🟤 <strong>Vintage Sepia</strong> — warm tones in your photo suit a retro palette</li>
                    </ul>
                    <button class="ai-suggestion-apply w-full" data-ai-action="suggest-grayscale">Apply Suggestion</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-intro">For a modern editorial style I suggest:</div>
                    <ul class="ai-suggestion-list">
                        <li>🌊 <strong>Cool tone</strong> — blue-shift trending in fashion photography</li>
                        <li>🌫️ <strong>Fade</strong> — soft matte finish popular on social media</li>
                    </ul>
                    <button class="ai-suggestion-apply w-full" data-ai-action="ai-filter">Apply Style</button>
                </div>`
        },
        retouch: {
            title: 'AI Retouch',
            html: `
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">AI detects blemishes and noise areas and automatically heals them.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="auto-heal">🩹 Auto Heal</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">Smooth skin tones while preserving fine details like eyes and hair.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="portrait-smooth">🌊 Portrait Smooth</button>
                </div>`
        },
        objects: {
            title: 'AI Remove',
            html: `
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">AI scans your image and automatically highlights removable objects — no manual selection needed.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="detect-objects">🔍 Auto-Detect Objects</button>
                </div>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">Use Rectangle for clean edges, Circle for round objects, Freehand for irregular shapes.</div>
                </div>`
        },
        ai: null,   // AI Tools panel has no right-side panel — it IS the AI section
        text: {
            title: 'AI Text',
            html: `
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">AI suggests a caption based on the content of your photo.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="suggest-caption">💬 Suggest Caption</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">AI checks that your text colour contrasts well against the background.</div>
                    <button class="ai-suggestion-apply w-full" data-ai-action="contrast-check">🎨 Contrast Check</button>
                </div>
                <div class="ai-suggestion-card">
                    <div class="ai-suggestion-desc">Be specific when adding objects — "a white fluffy cat on the grass" gives better results than "cat".</div>
                </div>`
        },
    };

    // Objects remove tool state — declared here so openTool() can reference it
    let currentRemoveTool = 'rectangle';
    const REMOVE_INSTRUCTIONS = {
        rectangle: 'Draw rectangles around each object to remove. Select multiple, then click Remove.',
        ellipse:   'Draw circles around each object to remove. Select multiple, then click Remove.',
        freehand:  'Draw freehand outlines around each object. Select multiple, then click Remove.',
    };

    let activeTool = null;

    function openTool(tool) {
        if (activeTool === tool) { closeTool(); return; }

        if (activeTool === 'text') deactivateTextTool();
        if (activeTool === 'objects' && tool !== 'objects') annotationLayer.clearAll();

        activeTool = tool;
        railBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));

        document.querySelectorAll('.tool-pane').forEach(p => p.style.display = 'none');
        const pane = document.getElementById(`pane-${tool}`);
        if (pane) pane.style.display = 'flex';

        toolPanelTitle.textContent = PANE_TITLES[tool] || tool;
        toolPanel.classList.add('open');

        if (tool === 'objects') {
            updateRemoveToolUI();
            updateRemoveActionsUI();
            if (editor.imageLoaded && !annotationLayer.active) annotationLayer.activate();
        }

        const aiContent = AI_PANEL_CONTENT[tool];
        if (aiContent && tool !== 'ai') {
            aiPanelTitle.textContent = aiContent.title;
            aiPanelBody.innerHTML = aiContent.html;
            aiPanelBody.querySelectorAll('.ai-suggestion-apply[data-ai-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.aiAction;
                    const isReusable = ['detect-objects', 'smart-inpaint'].includes(action);

                    handleAiAction(action);

                    if (!isReusable) {
                        // Mark applied and optionally collapse card
                        btn.textContent = '✅ Applied';
                        btn.disabled = true;
                        btn.classList.add('ai-applied');

                        const card = btn.closest('.ai-suggestion-card');
                        if (card) {
                            setTimeout(() => {
                                card.style.transition = 'opacity 0.4s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease';
                                card.style.opacity    = '0';
                                card.style.maxHeight  = card.offsetHeight + 'px';
                                requestAnimationFrame(() => requestAnimationFrame(() => {
                                    card.style.maxHeight = '0';
                                    card.style.overflow  = 'hidden';
                                    card.style.marginBottom = '0';
                                    card.style.paddingTop = '0';
                                    card.style.paddingBottom = '0';
                                }));
                                setTimeout(() => {
                                    card.remove();
                                    const remaining = aiPanelBody.querySelectorAll('.ai-suggestion-card');
                                    if (remaining.length === 0) {
                                        aiPanelBody.innerHTML = `
                                            <div class="ai-empty-state">
                                                <div class="ai-empty-icon">✦</div>
                                                <p class="ai-empty-title">All suggestions applied!</p>
                                                <p class="ai-empty-desc">You've used all AI suggestions for this section.</p>
                                            </div>`;
                                    }
                                }, 450);
                            }, 1200);
                        }
                    } else {
                        // Keep reusable objects suggestions available
                        btn.classList.remove('ai-applied');
                        btn.disabled = false;
                        if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
                    }
                });
            });
            aiPanel.classList.add('open');
        } else {
            aiPanel.classList.remove('open');
        }

        if (retouchActive && tool !== 'retouch') deactivateRetouchTool();

        if (tool === 'retouch') {
            annotationLayer.overlay.style.pointerEvents = 'none';
            activateRetouchTool();
        } else if (tool === 'objects') {
            hideRetouchCursor();
            if (!annotationLayer.active) annotationLayer.activate();
            annotationLayer.overlay.style.pointerEvents = 'auto';
            annotationLayer.setTool(currentRemoveTool);
            if (objectsInstructionText) objectsInstructionText.textContent = REMOVE_INSTRUCTIONS[currentRemoveTool];
            removeToolButtons.forEach(b => b.classList.toggle('active', b.dataset.removeTool === currentRemoveTool));
        } else {
            hideRetouchCursor();
            if (annotationLayer.active) annotationLayer.overlay.style.pointerEvents = 'none';
        }
    }

    function closeTool() {
        if (activeTool === 'text') deactivateTextTool();
        if (retouchActive) deactivateRetouchTool();
        hideRetouchCursor();
        if (activeTool === 'crop' && cropTool.active) cropTool.deactivate();
        if (annotationLayer.active) annotationLayer.overlay.style.pointerEvents = 'none';
        activeTool = null;
        railBtns.forEach(b => b.classList.remove('active'));
        toolPanel.classList.remove('open');
        aiPanel.classList.remove('open');
    }

    railBtns.forEach(btn => btn.addEventListener('click', () => openTool(btn.dataset.tool)));
    toolPanelClose.addEventListener('click', closeTool);
    aiPanelClose.addEventListener('click',   () => { aiPanel.classList.remove('open'); });

    // =========================================================
    // PRO — one-time AI panel hover tip
    // =========================================================
    const proAiTip = document.createElement('div');
    proAiTip.className = 'pro-ai-tip hidden';
    proAiTip.innerHTML = `
        <div class="pro-ai-tip-content">
            <strong>✦ AI Suggestions</strong>
            <p>Each section has context-aware AI suggestions here. Apply them with one click — and rate the result to help us improve.</p>
            <button class="btn btn-small" id="pro-ai-tip-close">Got it</button>
        </div>`;
    document.body.appendChild(proAiTip);

    let proAiTipShown = false;
    aiPanel.addEventListener('mouseenter', () => {
        if (proAiTipShown || currentRole !== 'pro') return;
        proAiTipShown = true;
        const rect = aiPanel.getBoundingClientRect();
        proAiTip.style.top  = (rect.top + 12) + 'px';
        proAiTip.style.left = (rect.left - 280) + 'px';
        proAiTip.classList.remove('hidden');
    });
    document.getElementById('pro-ai-tip-close').addEventListener('click', () => {
        proAiTip.classList.add('hidden');
    });


    // =========================================================
    // IMAGE UPLOAD
    // =========================================================
    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) { console.warn('[APP] handleFile: invalid file', file); return; }
        editor.loadImage(file).then(() => {
            dropZone.style.display = 'none';
            workspace.classList.add('has-image');
            resetSliders();
            annotationLayer.syncSize();
            if (currentRole === 'beginner' && !tourDone) {
                tourStep = 0; tourSubStep = 0;
                setTimeout(() => showTourStep(0, 0), 400);
            }
        }).catch(err => {
            console.error('[APP] handleFile: load failed', err);
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

        // avoid overlap with AI feedback panel at the bottom
        if (aiFeedbackToast && aiFeedbackToast.classList.contains('visible')) {
            snackbar.style.bottom = '100px';
        } else {
            snackbar.style.bottom = '28px';
        }

        snackbar.classList.add('show');
        clearTimeout(snackbarTimer);
        snackbarTimer = setTimeout(() => {
            snackbar.classList.remove('show');
            snackbar.style.bottom = '28px';
        }, duration);
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
    }

    function stopCompare() {
        compareCanvas.style.display = 'none';
        compareBadge.style.display  = 'none';
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

    const blurIntensityGroup = document.getElementById('blur-intensity-group');
    blurAmountSlider.addEventListener('input', () => {
        currentBlurAmount = parseInt(blurAmountSlider.value);
        blurAmountValue.textContent = currentBlurAmount;
    });

    function showBlurSlider(show) {
        if (blurIntensityGroup) blurIntensityGroup.style.display = show ? 'flex' : 'none';
    }

    // =========================================================
    // FILTER INTENSITY SYSTEM
    // =========================================================
    let activeFilterBtn       = null;   // which filter-btn is active
    let preFilterImageData    = null;   // snapshot BEFORE filter applied
    let filteredImageData     = null;   // snapshot AFTER filter at 100%
    let currentFilterIntensity = 100;

    const filterIntensitySection = document.getElementById('filter-intensity-section');
    const filterIntensitySlider  = document.getElementById('filter-intensity-slider');
    const filterIntensityValue   = document.getElementById('filter-intensity-value');
    const filterIntensityLabel   = document.getElementById('filter-intensity-label');
    const btnCommitFilter        = document.getElementById('btn-commit-filter');

    function blendImageData(a, b, t) {
        // t = 0 → pure a, t = 1 → pure b
        const out = new Uint8ClampedArray(a.data.length);
        for (let i = 0; i < a.data.length; i++) {
            out[i] = Math.round(a.data[i] * (1 - t) + b.data[i] * t);
        }
        return new ImageData(out, a.width, a.height);
    }

    function setActiveFilter(btn, filterFn, filterArgs = []) {
        if (!editor.imageLoaded) return;
        if (activeFilterBtn && activeFilterBtn !== btn) {
            activeFilterBtn.classList.remove('filter-applied');
        }
        activeFilterBtn = btn;
        btn.classList.add('filter-applied');

        // Show blur slider only for blur filter
        showBlurSlider(btn === btnBlur);

        preFilterImageData = editor.getImageData();
        filteredImageData = filterFn(preFilterImageData, ...filterArgs);
        editor.putImageData(filteredImageData);

        currentFilterIntensity = 100;
        if (filterIntensitySlider) filterIntensitySlider.value = 100;
        if (filterIntensityValue)  filterIntensityValue.textContent = '100%';
        if (filterIntensityLabel)  filterIntensityLabel.textContent = `${btn.querySelector('span:last-child')?.textContent || 'Filter'} Intensity`;
        if (filterIntensitySection) filterIntensitySection.style.display = 'flex';
    }

    function clearActiveFilter() {
        if (activeFilterBtn) activeFilterBtn.classList.remove('filter-applied');
        activeFilterBtn       = null;
        preFilterImageData    = null;
        filteredImageData     = null;
        currentFilterIntensity = 100;
        showBlurSlider(false);
        if (filterIntensitySection) filterIntensitySection.style.display = 'none';
    }

    // Live blend on slider drag
    if (filterIntensitySlider) {
        filterIntensitySlider.addEventListener('input', () => {
            currentFilterIntensity = parseInt(filterIntensitySlider.value);
            if (filterIntensityValue) filterIntensityValue.textContent = currentFilterIntensity + '%';
            if (!preFilterImageData || !filteredImageData) return;
            const blended = blendImageData(preFilterImageData, filteredImageData, currentFilterIntensity / 100);
            editor.putImageData(blended);
        });
    }

    // Commit button: burn the blended result into history so undo works
    if (btnCommitFilter) {
        btnCommitFilter.addEventListener('click', () => {
            if (!editor.imageLoaded) return;
            const currentData = editor.getImageData();
            editor.history.push(currentData);
            editor.baseImageData = currentData;
            editor._notifyChange();
            showSnackbar(`✅ Filter applied at ${currentFilterIntensity}%`);
            preFilterImageData = null;
            filteredImageData  = null;
            if (filterIntensitySection) filterIntensitySection.style.display = 'none';
        });
    }

    // Cancel button: revert to pre-filter state
    const btnCancelFilter = document.getElementById('btn-cancel-filter');
    if (btnCancelFilter) {
        btnCancelFilter.addEventListener('click', () => {
            if (preFilterImageData) editor.putImageData(preFilterImageData);
            clearActiveFilter();
            if (filterIntensitySection) filterIntensitySection.style.display = 'none';
        });
    }

    function makeFilterClick(btn, filterFn, filterArgs = []) {
        return withCommitWrap(() => {
            if (!editor.imageLoaded) return;
            // Re-clicking the active filter just changes intensity via slider
            if (btn.classList.contains('filter-applied')) return;
            // Commit any pending adjustments first
            setActiveFilter(btn, filterFn, filterArgs);
        });
    }

    btnGrayscale.addEventListener('click', makeFilterClick(btnGrayscale, grayscale));
    btnSepia.addEventListener('click',     makeFilterClick(btnSepia,     sepia));
    btnInvert.addEventListener('click',    makeFilterClick(btnInvert,    invert));
    btnBlur.addEventListener('click',      makeFilterClick(btnBlur,      (d) => blur(d, currentBlurAmount)));
    btnWarm.addEventListener('click',      makeFilterClick(btnWarm,      applyWarm));
    btnCool.addEventListener('click',      makeFilterClick(btnCool,      applyCool));
    btnVivid.addEventListener('click',     makeFilterClick(btnVivid,     applyVividFilter));
    btnFade.addEventListener('click',      makeFilterClick(btnFade,      applyFade));
    btnSharpen.addEventListener('click',   makeFilterClick(btnSharpen,   applySharpenFilter));
    btnNoise.addEventListener('click',     makeFilterClick(btnNoise,     applyNoiseFilter));


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
        annotationLayer.overlay.style.pointerEvents = 'none';
        canvas.style.cursor = 'none';
        canvas.addEventListener('mousedown',  onRetouchStart);
        canvas.addEventListener('mousemove',  onRetouchMove);
        canvas.addEventListener('mouseup',    onRetouchEnd);
        canvas.addEventListener('mouseleave', onRetouchEnd);
        canvas.addEventListener('mousemove',  showRetouchCursor);
        canvas.addEventListener('mouseleave', hideRetouchCursor);
        if (retouchCursor) {
            retouchCursor.style.width  = retouchRadius * 2 + 'px';
            retouchCursor.style.height = retouchRadius * 2 + 'px';
        }
        modeIndicatorText.textContent = 'Retouch Mode';
        modeIndicator.style.display   = 'flex';
    }

    function deactivateRetouchTool() {
        retouchActive = false;
        canvas.style.cursor = '';
        canvas.removeEventListener('mousedown',  onRetouchStart);
        canvas.removeEventListener('mousemove',  onRetouchMove);
        canvas.removeEventListener('mouseup',    onRetouchEnd);
        canvas.removeEventListener('mouseleave', onRetouchEnd);
        canvas.removeEventListener('mousemove',  showRetouchCursor);
        canvas.removeEventListener('mouseleave', hideRetouchCursor);
        hideRetouchCursor();
        modeIndicator.style.display = 'none';
    }

    function showRetouchCursor(e) {
        if (!retouchCursor || !retouchActive) return;
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        retouchCursor.style.display = 'block';
        retouchCursor.style.left = (e.clientX - wrapperRect.left) + 'px';
        retouchCursor.style.top  = (e.clientY - wrapperRect.top)  + 'px';
    }

    function hideRetouchCursor() {
        if (retouchCursor) retouchCursor.style.display = 'none';
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
    const aiFeedbackReasonSection = document.getElementById('ai-feedback-reason-section');
    const aiFeedbackReasonTitle = document.getElementById('ai-feedback-reason-title');
    const aiFeedbackReasonButtons = document.getElementById('ai-feedback-reason-buttons');

    const detectConfirmPanel = document.getElementById('ai-detect-confirm-panel');
    const detectConfirmBody = document.getElementById('ai-detect-confirm-body');
    const detectConfirmKeep = document.getElementById('ai-detect-confirm-keep');
    const detectConfirmReject = document.getElementById('ai-detect-confirm-reject');
    const detectConfirmProgress = document.getElementById('ai-detect-confirm-progress');

    let aiFbAutoDismiss = null;
    let aiFbUndoSnapshot = null; // imageData to undo to
    let aiFeedbackState = null;
    let aiFeedbackReason = null;
    let aiFeedbackContext = 'default';

    let aiDetectNegativeStreak = 0;
    let aiRequireConfirmEachDetection = false;
    const AI_DETECT_NEGATIVE_THRESHOLD = 2;


    const FEEDBACK_REASONS = {
        default: {
            good: [
                'Natural look', 'Strong improvement', 'Color and tone are great', 'Preserved detail',
                'Balanced shadows and highlights', 'Sharpness feels right', 'Comfortable brightness',
                'Good contrast balance', 'Looks like a pro edit'
            ],
            bad: [
                'Effect too strong', 'Color is off', 'Loss of detail', 'Not what I expected', 'Other',
                'Over-saturated', 'Underexposed', 'Too much blur', 'Harsh contrast'
            ],
        },
        detect: {
            good: [
                'Detected objects accurately', 'Quick detection', 'Great boundaries', 'Easy selection',
                'All key objects found', 'No false positives', 'Object edges are clean', 'Speedy prediction'
            ],
            bad: [
                'Missed objects', 'Too many false positives', 'Not in right area', 'Other',
                'Wrong size boxes', 'Partially detected', 'Too noisy', 'Not consistent'
            ],
        },
        inpaint: {
            good: [
                'Blended naturally', 'No artifacts', 'Looks seamless', 'Refined fill',
                'Color match is perfect', 'No visible transitions', 'Texture preserved', 'No ghosting'
            ],
            bad: [
                'Visible artifacts', 'Unnatural edges', 'Color mismatch', 'Other',
                'Too soft', 'Patchy fill', 'Mismatch with surrounding', 'Looks fake'
            ],
        },
    };

    const MOTIVATIONS = [
        'Your rating directly improves future edits for everyone.',
        'This helps us tune AI in the next release.',
        'Feedback gets better suggestions for all users.',
        'A short response makes the system more reliable for others.',
    ];

    function showAiFeedback(label, undoFn, context = 'default') {
        aiFeedbackContext = context;
        aiFbUndoSnapshot = undoFn || null;
        aiFbUp.classList.remove('selected-up');
        aiFbDown.classList.remove('selected-down');
        aiFeedbackThanks.style.display = 'none';
        aiFeedbackReasonSection.style.display = 'none';
        aiFbUndo.style.display = 'none';
        aiFeedbackState = null;
        aiFeedbackReason = null;

        aiFeedbackLabelEl.textContent = label;
        const sub = aiFeedbackToast.querySelector('.ai-feedback-sub');
        if (sub) sub.textContent = MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];

        aiFeedbackToast.classList.add('visible');
        clearTimeout(aiFbAutoDismiss);
        aiFbAutoDismiss = setTimeout(() => dismissAiFeedback(false), 10000);
    }

    function shuffleArray(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function renderReasonButtons(type) {
        const set = FEEDBACK_REASONS[aiFeedbackContext] || FEEDBACK_REASONS.default;
        const options = type === 'good' ? shuffleArray(set.good) : shuffleArray(set.bad);
        aiFeedbackReasonTitle.textContent = type === 'good' ? 'What did you like most?' : 'What can we improve?';
        aiFeedbackReasonButtons.innerHTML = options.map(option => `<button type="button" class="ai-feedback-reason-btn">${option}</button>`).join('');

        aiFeedbackReasonButtons.querySelectorAll('.ai-feedback-reason-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                aiFeedbackReason = btn.textContent;
                aiFeedbackReasonButtons.querySelectorAll('.ai-feedback-reason-btn').forEach(other => other.classList.remove('selected'));
                btn.classList.add('selected');

                aiFeedbackThanksText.textContent = type === 'good'
                    ? `Fantastic! ${aiFeedbackReason} helps us build even better results for everyone.`
                    : `Thanks for sharing “${aiFeedbackReason}”. This helps improve future edits across the system.`;
                aiFeedbackToast.querySelector('.ai-feedback-sub').textContent = 'Your feedback will be used to improve models and workflows for all users.';
                aiFeedbackReasonSection.style.display = 'none';
                aiFeedbackThanks.style.display = 'block';
                setTimeout(() => dismissAiFeedback(true), 1600);
            });
        });
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

    let pendingDetectCandidates = [];
    let detectCandidateIndex = 0;

    function hideDetectConfirmPanel() {
        if (detectConfirmPanel) {
            detectConfirmPanel.classList.remove('visible');
        }
    }

    function showDetectConfirmPanel() {
        if (!detectConfirmPanel || pendingDetectCandidates.length === 0) return;

        const candidate = pendingDetectCandidates[detectCandidateIndex];
        detectConfirmBody.textContent = `AI detected: ${candidate.reason || candidate.label || 'candidate'}. Keep this selection?`;
        detectConfirmProgress.textContent = `(${detectCandidateIndex + 1} of ${pendingDetectCandidates.length})`;
        detectConfirmPanel.classList.add('visible');

        annotationLayer.setTempCandidate(candidate);
    }

    function processDetectCandidate(keep) {
        const candidate = pendingDetectCandidates[detectCandidateIndex];
        if (keep) {
            annotationLayer.annotations.push(candidate);
        }

        detectCandidateIndex += 1;

        if (detectCandidateIndex >= pendingDetectCandidates.length) {
            hideDetectConfirmPanel();
            pendingDetectCandidates = [];
            detectCandidateIndex = 0;
            aiRequireConfirmEachDetection = false;
            aiDetectNegativeStreak = 0;
            annotationLayer.clearTempCandidate();
            updateRemoveActionsUI();
            showSnackbar('✅ AI object confirmations complete.');
        } else {
            showDetectConfirmPanel();
        }

        annotationLayer.redraw();
        annotationLayer._notifyChange();
    }

    if (detectConfirmKeep) detectConfirmKeep.addEventListener('click', () => processDetectCandidate(true));
    if (detectConfirmReject) detectConfirmReject.addEventListener('click', () => processDetectCandidate(false));

    aiFbUp.addEventListener('click', () => {
        aiFeedbackState = 'good';
        aiFbUp.classList.add('selected-up');
        aiFbDown.classList.remove('selected-down');
        aiFbUndo.style.display = 'none';
        clearTimeout(aiFbAutoDismiss);

        if (aiFeedbackContext === 'detect') {
            aiDetectNegativeStreak = 0;
            aiRequireConfirmEachDetection = false;
            aiFeedbackToast.querySelector('.ai-feedback-sub').textContent = 'Great detection! Pick the reason that matches your result.';
        } else if (aiFeedbackContext === 'inpaint') {
            aiFeedbackToast.querySelector('.ai-feedback-sub').textContent = 'Great inpaint! Pick the reason that matches your result.';
        } else {
            aiFeedbackToast.querySelector('.ai-feedback-sub').textContent = 'Great! Select a reason so we can improve this experience for everyone.';
        }

        aiFeedbackReasonSection.style.display = 'flex';
        renderReasonButtons('good');
    });

    aiFbDown.addEventListener('click', () => {
        aiFeedbackState = 'bad';
        aiFbDown.classList.add('selected-down');
        aiFbUp.classList.remove('selected-up');
        aiFbUndo.style.display = '';
        clearTimeout(aiFbAutoDismiss);

        if (aiFeedbackContext === 'detect') {
            aiDetectNegativeStreak += 1;
            if (aiDetectNegativeStreak >= AI_DETECT_NEGATIVE_THRESHOLD) {
                aiRequireConfirmEachDetection = true;
                showSnackbar('⚠️ Auto-detect got bad feedback twice; next detection requires per-item confirmation.');
            }
            aiFeedbackToast.querySelector('.ai-feedback-sub').textContent = 'Not ideal detection — tell us what went wrong.';
        } else if (aiFeedbackContext === 'inpaint') {
            aiFeedbackToast.querySelector('.ai-feedback-sub').textContent = 'Not ideal inpaint — tell us what went wrong.';
        } else {
            aiFeedbackToast.querySelector('.ai-feedback-sub').textContent = 'Sorry this did not work well. Select a reason to help us improve.';
        }

        aiFeedbackReasonSection.style.display = 'flex';
        renderReasonButtons('bad');
    });

    aiFbClose.addEventListener('click', () => {
        aiFbUp.style.display   = '';
        aiFbDown.style.display = '';
        dismissAiFeedback(false);
    });

    function showAiError(title, detail) {
        // Reuse the feedback toast but in error mode
        dismissAiFeedback(false); // close any open feedback first
        aiFbUp.style.display   = 'none';
        aiFbDown.style.display = 'none';
        aiFbUndo.style.display = 'none';
        aiFeedbackThanks.style.display = 'none';

        aiFeedbackLabelEl.innerHTML = `<span style="color:#f85149;">⚠️ ${title}</span>`;
        const sub = aiFeedbackToast.querySelector('.ai-feedback-sub');
        if (sub) sub.innerHTML = `<span style="color:var(--text-secondary);font-size:11px;">${detail}</span>`;

        aiFeedbackToast.classList.add('visible');
        clearTimeout(aiFbAutoDismiss);
        aiFbAutoDismiss = setTimeout(() => {
            // Restore hidden elements when toast closes
            aiFbUp.style.display   = '';
            aiFbDown.style.display = '';
            aiFeedbackToast.classList.remove('visible');
        }, 6000);
    }

    aiFbUndo.addEventListener('click', () => {
        editor.undo();
        resetSliders();
        clearActiveFilter();
        if (filterAiResult) filterAiResult.style.display = 'none';
        aiFeedbackReasonSection.style.display = 'none';
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
    // AI TOOLS PANEL BUTTONS + USED ACTION TRACKING
    // =========================================================
    const usedAiActions = new Set();

    function markAiActionUsed(action) {
        const isReusable = ['detect-objects', 'smart-inpaint'].includes(action);
        if (!isReusable) {
            usedAiActions.add(action);
        }

        if (aiPanelBody) {
            aiPanelBody.querySelectorAll(`.ai-suggestion-apply[data-ai-action="${action}"]`).forEach(btn => {
                if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
                if (!isReusable) {
                    btn.classList.add('ai-applied');
                    btn.disabled = true;
                    btn.textContent = '✅ Applied';
                } else {
                    // keep reusable suggestions visible and active
                    btn.classList.remove('ai-applied');
                    btn.disabled = false;
                    if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
                }
            });
        }

        // Mark ai-cat-btn in left pane only for non-reusable actions
        const catMap = {
            'auto-enhance':'btn-ai-adjust','boost-brightness':'btn-ai-adjust','vivid':'btn-ai-adjust',
            'ai-filter':'btn-ai-filter','suggest-grayscale':'btn-ai-filter','suggest-sepia':'btn-ai-filter',
            'crop-thirds':'btn-ai-crop','crop-square':'btn-ai-crop','auto-straighten':'btn-ai-crop',
            'auto-heal':'btn-ai-retouch-btn','portrait-smooth':'btn-ai-retouch-btn',
        };
        const catId = catMap[action];
        if (catId && !isReusable) {
            const b = document.getElementById(catId);
            if (b) { b.classList.add('ai-applied'); b.disabled = true; }
        }
    }

    function clearUsedAiActions() {
        usedAiActions.clear();
        document.querySelectorAll('.ai-cat-btn.ai-applied, #btn-ai-overall.ai-applied').forEach(b => { b.classList.remove('ai-applied'); b.disabled = false; });
        if (aiPanelBody) {
            aiPanelBody.querySelectorAll('.ai-suggestion-apply.ai-applied').forEach(b => {
                b.classList.remove('ai-applied'); b.disabled = false;
                if (b.dataset.origText) b.textContent = b.dataset.origText;
            });
        }
    }

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
    if (btnAiCropCat)    btnAiCropCat.addEventListener('click',    () => handleAiAction('crop-thirds'));
    if (btnAiRetouchCat) btnAiRetouchCat.addEventListener('click', () => handleAiAction('auto-heal'));

    function handleAiAction(action) {
        if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }
        markAiActionUsed(action);
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
            case 'smart-inpaint': {
                showAiFeedback('✨ AI Smart Inpaint applied', null, 'inpaint');
                break;
            }
            case 'detect-objects': {
                if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); break; }

                annotationLayer.clearTempCandidate();
                const candidates = annotationLayer.aiDetectObjects(canvas);

                if (candidates.length === 0) {
                    showSnackbar('🔍 No objects detected. Try another area or tool.');
                    break;
                }

                if (aiRequireConfirmEachDetection) {
                    pendingDetectCandidates = candidates;
                    detectCandidateIndex = 0;
                    showDetectConfirmPanel();
                } else {
                    annotationLayer.addAnnotations(candidates);
                    updateRemoveActionsUI();
                }

                // clear forced confirm after one initiation
                if (aiRequireConfirmEachDetection) {
                    showSnackbar('⚠️ Confirm each detected selection via the confirmation panel.');
                } else {
                    showSnackbar(`🔍 Detected ${candidates.length} object${candidates.length > 1 ? 's' : ''}. Draw selections or click Remove Selected Objects.`);
                }

                showAiFeedback(`🔍 AI Object Detection applied`, () => { editor.undo(); resetSliders(); }, 'detect');
                break;
            }
            case 'crop-thirds':    showAiFeedback('✂️ AI Rule of Thirds Crop applied', null, 'default'); break;
            case 'crop-square':    showAiFeedback('🔲 AI Square Crop applied', null); break;
            case 'auto-straighten':showAiFeedback('🔄 AI Auto Straighten applied', null); break;
            case 'ai-smart-crop': {
                // Simulate async AI call that fails
                const btn = aiPanelBody ? aiPanelBody.querySelector('[data-ai-action="ai-smart-crop"]') : null;
                if (btn) { btn.textContent = '⏳ Analysing…'; btn.disabled = true; }
                setTimeout(() => {
                    try {
                        // Intentional failure — subject detection not available in browser
                        throw new Error('Subject detection model failed to load (network timeout).');
                    } catch (err) {
                        showAiError('🤖 AI Smart Crop failed', err.message);
                        // Re-enable button so user can retry
                                        if (btn) {
                            if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
                            btn.disabled = false;
                            btn.classList.remove('ai-applied');
                        }
                    }
                }, 1800);
                break;
            }
            case 'suggest-caption':showAiFeedback('💬 AI Caption suggested', null); break;
            case 'contrast-check': showAiFeedback('🎨 AI Contrast Check done', null); break;
            default: showAiFeedback(`🤖 AI action applied`, null);
        }
    }

    // =========================================================
    // REMOVE OBJECTS PANE
    // =========================================================
    const removeToolButtons    = document.querySelectorAll('#remove-tool-toggle .mode-btn');
    const objectsInstructionText = document.getElementById('objects-instruction-text');
    const btnRemoveObject      = document.getElementById('btn-remove-object');
    const btnClearSelection    = document.getElementById('btn-clear-selection');
    const removeSelectionCount = document.getElementById('remove-selection-count');
    const removeSelectionList  = document.getElementById('remove-selection-list');
    // currentRemoveTool and REMOVE_INSTRUCTIONS declared near top of scope

    function updateRemoveToolUI() {
        removeToolButtons.forEach(b => b.classList.toggle('active', b.dataset.removeTool === currentRemoveTool));
        if (objectsInstructionText) objectsInstructionText.textContent = REMOVE_INSTRUCTIONS[currentRemoveTool];
        annotationLayer.setTool(currentRemoveTool);
    }

    removeToolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            currentRemoveTool = btn.dataset.removeTool;
            updateRemoveToolUI();
        });
    });

    // Update selection count badge and button states
    function updateRemoveActionsUI() {
        const visibleAnnotations = annotationLayer.annotations ? annotationLayer.annotations.filter(a => !a.hidden) : [];
        const count = visibleAnnotations.length;
        if (btnRemoveObject)   btnRemoveObject.disabled   = count === 0;
        if (btnClearSelection) btnClearSelection.disabled = count === 0;
        if (removeSelectionCount) {
            if (count > 0) {
                removeSelectionCount.style.display = 'block';
                removeSelectionCount.textContent = `${count} area${count > 1 ? 's' : ''} selected`;
            } else {
                removeSelectionCount.style.display = 'none';
            }
        }
        if (removeSelectionList) {
            removeSelectionList.innerHTML = '';
            if (count === 0) {
                const li = document.createElement('li');
                li.className = 'selection-item';
                li.textContent = 'No selections yet.';
                removeSelectionList.appendChild(li);
            } else {
                visibleAnnotations.forEach(ann => {
                    const li = document.createElement('li');
                    li.className = `selection-item ${ann.aiGenerated ? 'ai-selection' : 'user-selection'}`;
                    const sourceText = ann.source === 'ai' ? 'AI detected' : 'User selected';
                    const typeText = ann.label || ann.type || 'Area';

                    li.innerHTML = `
                        <div class="selection-meta">
                            <div class="selection-source">${sourceText} • ${typeText}</div>
                            <button type="button" class="selection-remove-btn" title="Remove this object">✕</button>
                        </div>
                        <div class="selection-reason">${ann.reason || (ann.source === 'ai' ? 'AI suggests removal due to likely object.' : 'User-defined removal area.')}</div>
                    `;

                    const removeBtn = li.querySelector('.selection-remove-btn');
                    removeBtn.addEventListener('click', () => {
                        annotationLayer.deleteAnnotation(ann.id);
                        updateRemoveActionsUI();
                        showSnackbar('🗑️ Selection area removed from list (image unchanged).');
                    });

                    li.addEventListener('click', (e) => {
                        if (e.target.closest('.selection-remove-btn')) return;
                        annotationLayer.selectAnnotation(ann.id);
                    });

                    removeSelectionList.appendChild(li);
                });
            }
        }
    }

    function drawMaskForAnnotation(ctx, ann) {
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = (ann.lineWidth || 3) * 2;

        switch (ann.type) {
            case ANNOTATION_TOOLS.RECTANGLE:
                ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
                break;
            case ANNOTATION_TOOLS.ELLIPSE:
                ctx.ellipse(ann.cx, ann.cy, ann.rx, ann.ry, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
            case ANNOTATION_TOOLS.MARKER:
                ctx.beginPath(); ctx.arc(ann.x, ann.y, ann.radius || 8, 0, Math.PI * 2); ctx.fill();
                break;
            case ANNOTATION_TOOLS.FREEHAND:
                if (Array.isArray(ann.path) && ann.path.length > 1) {
                    ctx.lineWidth = Math.max(ann.lineWidth || 4, 4);
                    ctx.beginPath();
                    ctx.moveTo(ann.path[0].x, ann.path[0].y);
                    for (let i = 1; i < ann.path.length; i++) ctx.lineTo(ann.path[i].x, ann.path[i].y);
                    ctx.stroke();
                }
                break;
            case ANNOTATION_TOOLS.ARROW:
                ctx.lineWidth = Math.max(ann.lineWidth || 4, 6);
                ctx.beginPath();
                ctx.moveTo(ann.fromX, ann.fromY);
                ctx.lineTo(ann.toX, ann.toY);
                ctx.stroke();
                break;
            case ANNOTATION_TOOLS.TEXT:
                // fallback: approximate text box from coords
                const tw = (ann.text || '').length * (ann.fontSize || 14) * 0.6;
                const th = ann.fontSize || 14;
                ctx.fillRect(ann.x - 4, ann.y - th - 4, tw + 8, th + 8);
                break;
            default:
                break;
        }

        ctx.restore();
    }

    function applyBackgroundRemoval() {
        if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }
        const selected = annotationLayer.annotations ? annotationLayer.annotations.filter(a => !a.hidden) : [];
        if (selected.length === 0) {
            showSnackbar('📌 Create or detect objects first for background removal.');
            return;
        }

        const w = canvas.width;
        const h = canvas.height;

        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = w;
        blurCanvas.height = h;
        const blurCtx = blurCanvas.getContext('2d');
        blurCtx.filter = 'blur(16px)';
        blurCtx.drawImage(canvas, 0, 0, w, h);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = w;
        maskCanvas.height = h;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.fillStyle = 'black';
        maskCtx.fillRect(0, 0, w, h);
        selected.forEach(ann => drawMaskForAnnotation(maskCtx, ann));

        const originalImage = editor.getImageData();
        const blurredImage = blurCtx.getImageData(0, 0, w, h);
        const maskData = maskCtx.getImageData(0, 0, w, h);
        const out = editor.ctx.createImageData(w, h);

        for (let i = 0; i < out.data.length; i += 4) {
            const m = maskData.data[i] / 255;
            out.data[i]   = originalImage.data[i]   * m + blurredImage.data[i]   * (1 - m);
            out.data[i+1] = originalImage.data[i+1] * m + blurredImage.data[i+1] * (1 - m);
            out.data[i+2] = originalImage.data[i+2] * m + blurredImage.data[i+2] * (1 - m);
            out.data[i+3] = originalImage.data[i+3] * m + blurredImage.data[i+3] * (1 - m);
        }

        editor.putImageData(out);
        annotationLayer.clearAll();
        annotationLayer.syncSize();

        editor.history.push(editor.getImageData());
        editor.baseImageData = editor.getImageData();
        editor._notifyChange();

        updateRemoveActionsUI();
        showSnackbar('✂️ Background removed based on selection.');
        showAiFeedback('✂️ Background removal applied', null, 'inpaint');
    }

    annotationLayer.onChange(() => { updateRemoveActionsUI(); });

    if (btnClearSelection) {
        btnClearSelection.addEventListener('click', () => {
            annotationLayer.clearAll();
            updateRemoveActionsUI();
            showSnackbar('Selections cleared');
        });
    }

    if (btnRemoveObject) {
        btnRemoveObject.addEventListener('click', () => {
            if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }
            const selected = annotationLayer.annotations ? annotationLayer.annotations.filter(a => !a.hidden) : [];
            const count = selected.length;
            if (count === 0) {
                showSnackbar('ℹ️ Draw or detect at least one object to remove.');
                return;
            }

            btnRemoveObject.disabled = true;
            btnRemoveObject.textContent = '⏳ Removing…';

            selected.forEach(a => annotationLayer.eraseObject(a.id, canvas));
            editor.history.push(editor.getImageData());
            editor.baseImageData = editor.getImageData();
            editor._notifyChange();

            showSnackbar(`🗑️ ${count} object${count > 1 ? 's' : ''} removed`);
            updateRemoveActionsUI();

            setTimeout(() => {
                btnRemoveObject.disabled = false;
                btnRemoveObject.textContent = '🗑️ Remove Selected Objects';
            }, 400);
        });
    }

    const btnRemoveBg = document.getElementById('btn-remove-bg');
    if (btnRemoveBg) {
        btnRemoveBg.addEventListener('click', () => {
            btnRemoveBg.disabled = true; btnRemoveBg.textContent = '⏳ Removing background…';
            setTimeout(() => {
                applyBackgroundRemoval();
                btnRemoveBg.disabled = false;
                btnRemoveBg.textContent = '✂️ Remove Background';
            }, 150);
        });
    }

    // Activate annotation layer when objects tool is opened
    editor.onChange(() => {
        if (editor.imageLoaded && !annotationLayer.active) annotationLayer.activate();
    });

    // =========================================================
    // TEXT PANE — generate/add object
    // =========================================================
    const objectPromptInput = document.getElementById('object-prompt');
    const btnGenerateObject = document.getElementById('btn-generate-object');

    if (objectPromptInput) {
        objectPromptInput.addEventListener('input', () => {
            if (btnGenerateObject) btnGenerateObject.disabled = objectPromptInput.value.trim().length === 0;
        });
    }

    if (btnGenerateObject) {
        btnGenerateObject.addEventListener('click', () => {
            if (!editor.imageLoaded) { showSnackbar('🖼️ Open an image first.'); return; }
            const prompt = objectPromptInput ? objectPromptInput.value.trim() : '';
            if (!prompt) return;
            btnGenerateObject.disabled = true;
            btnGenerateObject.textContent = '⏳ Generating…';
            setTimeout(() => {
                showSnackbar(`✨ "${prompt}" — AI generation (integration needed)`);
                btnGenerateObject.disabled = false;
                btnGenerateObject.textContent = '✨ Generate & Add';
                if (objectPromptInput) objectPromptInput.value = '';
            }, 1500);
        });
    }

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
        'ai':         'Open AI Tools (✦) — click AI Edit Everything for a full auto-enhance.',
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
        div.innerHTML = `<span class="chat-avatar">${isUser ? '👤' : '✦'}</span><div class="chat-bubble">${text.replace(/\n/g, '<br>')}</div>`;
        chatbotMessages.appendChild(div);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    function showTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'chat-message bot';
        div.innerHTML = `<span class="chat-avatar">✦</span><div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
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
    btnUndo.addEventListener('click', () => {
        commitPendingAdjustments(); editor.undo(); resetSliders(); annotationLayer.syncSize();
    });
    btnRedo.addEventListener('click', () => {
        commitPendingAdjustments(); editor.redo(); resetSliders(); annotationLayer.syncSize();
    });

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
    btnDownload.addEventListener('click', withCommitWrap(() => {
        if (!editor.imageLoaded) return;
        const merged = annotationLayer.flattenOnto(canvas);
        downloadDataURL(merged.toDataURL('image/png'), 'edited-image.png');
    }));

    btnReset.addEventListener('click', () => {
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
        clearActiveFilter();
        preFilterImageData = null;
        filteredImageData  = null;
        if (filterIntensitySection) filterIntensitySection.style.display = 'none';
        clearUsedAiActions();
        // Hide AI feedback toast if showing
        dismissAiFeedback(false);
        annotationLayer.clearAll();
        annotationLayer.syncSize();
        editor._notifyChange();
        showSnackbar('🔄 Reset to original');
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

