/**
 * SlideSnap Pro - Core Application Engine v2
 * Added: Crop Region Selection - captures only the chosen area of the screen
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  const startCaptureBtn      = document.getElementById('startCaptureBtn');
  const stopCaptureBtn       = document.getElementById('stopCaptureBtn');
  const exportPdfBtn         = document.getElementById('exportPdfBtn');
  const quickExportBtn       = document.getElementById('quickExportBtn');
  const snapManualBtn        = document.getElementById('snapManualBtn');
  const clearAllBtn          = document.getElementById('clearAllBtn');
  const selectRegionBtn      = document.getElementById('selectRegionBtn');
  const clearRegionBtn       = document.getElementById('clearRegionBtn');

  const autoCaptureToggle    = document.getElementById('autoCaptureToggle');
  const soundToggle          = document.getElementById('soundToggle');
  const sensitivityRange     = document.getElementById('sensitivityRange');
  const sensitivityValText   = document.getElementById('sensitivityValText');
  const settleDelayRange     = document.getElementById('settleDelayRange');
  const settleDelayValText   = document.getElementById('settleDelayValText');
  const pdfFileNameInput     = document.getElementById('pdfFileNameInput');

  const liveVideo            = document.getElementById('liveVideo');
  const regionOverlayCanvas  = document.getElementById('regionOverlayCanvas');
  const regionOverlayCtx    = regionOverlayCanvas.getContext('2d');
  const cropBox              = document.getElementById('cropBox');
  const regionIndicator      = document.getElementById('regionIndicator');
  const regionIndicatorText  = document.getElementById('regionIndicatorText');
  const regionInstructionBar = document.getElementById('regionInstructionBar');
  const shutterFlash         = document.getElementById('shutterFlash');
  const emptyStreamOverlay   = document.getElementById('emptyStreamOverlay');

  const streamStatusBadge    = document.getElementById('streamStatusBadge');
  const streamStatusText     = document.getElementById('streamStatusText');
  const streamResolutionText = document.getElementById('streamResolutionText');
  const cropRegionText       = document.getElementById('cropRegionText');
  const detectorStatusText   = document.getElementById('detectorStatusText');
  const lastSnapTimeText     = document.getElementById('lastSnapTimeText');
  const slideCountBadge      = document.getElementById('slideCountBadge');
  const deckCountBadge       = document.getElementById('deckCountBadge');

  const diffMeterFill        = document.getElementById('diffMeterFill');
  const diffMeterText        = document.getElementById('diffMeterText');

  const slidesGrid           = document.getElementById('slidesGrid');
  const emptyGallery         = document.getElementById('emptyGallery');

  const analysisCanvas       = document.getElementById('analysisCanvas');
  const analysisCtx          = analysisCanvas.getContext('2d', { willReadFrequently: true });
  const snapshotCanvas       = document.getElementById('snapshotCanvas');
  const snapshotCtx          = snapshotCanvas.getContext('2d');

  const lightboxModal           = document.getElementById('lightboxModal');
  const lightboxImg             = document.getElementById('lightboxImg');
  const lightboxTitle           = document.getElementById('lightboxTitle');
  const closeLightboxBtn        = document.getElementById('closeLightboxBtn');
  const lightboxPrevBtn         = document.getElementById('lightboxPrevBtn');
  const lightboxNextBtn         = document.getElementById('lightboxNextBtn');
  const lightboxDownloadSingleBtn = document.getElementById('lightboxDownloadSingleBtn');
  const exportProgressModal     = document.getElementById('exportProgressModal');
  const exportProgressBar       = document.getElementById('exportProgressBar');
  const exportProgressPct       = document.getElementById('exportProgressPct');
  const exportProgressTitle     = document.getElementById('exportProgressTitle');
  const toastContainer          = document.getElementById('toastContainer');

  // --- State ---
  let mediaStream          = null;
  let videoTrack           = null;
  let slides               = [];
  let currentLightboxIndex = -1;

  // Analysis dimensions
  const ANALYSIS_WIDTH  = 160;
  const ANALYSIS_HEIGHT = 90;
  analysisCanvas.width  = ANALYSIS_WIDTH;
  analysisCanvas.height = ANALYSIS_HEIGHT;

  let lastSavedImageData  = null;
  let previousFrameData   = null;
  let monitorIntervalId   = null;
  let isSettling          = false;
  let settleStartTime     = 0;
  let settleDurationMs    = 1000;
  let diffThresholdPct    = 8.0;
  let isAutoCaptureEnabled = true;
  let isSoundEnabled      = true;

  // --- Crop Region State ---
  // All values are in VIDEO PIXEL coordinates (not display pixels)
  let cropRegion = null;     // { x, y, w, h } in video pixels — null means full screen
  let isSelectingRegion = false;
  let selectionStart   = null;  // { vx, vy } in video pixels

  let audioCtx = null;

  // =====================================================================
  //  INIT
  // =====================================================================
  function init() {
    setupEventListeners();
    updateSensitivityLabel(sensitivityRange.value);
    updateSettleDelayLabel(settleDelayRange.value);
  }

  function setupEventListeners() {
    startCaptureBtn.addEventListener('click', startScreenCapture);
    stopCaptureBtn.addEventListener('click', stopScreenCapture);
    snapManualBtn.addEventListener('click', () => captureSlide('manual'));
    exportPdfBtn.addEventListener('click', generatePdf);
    quickExportBtn.addEventListener('click', generatePdf);
    clearAllBtn.addEventListener('click', confirmClearAll);
    selectRegionBtn.addEventListener('click', startRegionSelection);
    clearRegionBtn.addEventListener('click', clearCropRegion);

    autoCaptureToggle.addEventListener('change', (e) => {
      isAutoCaptureEnabled = e.target.checked;
      showToast(isAutoCaptureEnabled ? 'الالتقاط التلقائي مُفعَّل' : 'الالتقاط التلقائي متوقف — الوضع اليدوي نشط', 'info');
    });

    soundToggle.addEventListener('change', (e) => { isSoundEnabled = e.target.checked; });

    sensitivityRange.addEventListener('input', (e) => {
      diffThresholdPct = parseFloat(e.target.value);
      updateSensitivityLabel(e.target.value);
    });

    settleDelayRange.addEventListener('input', (e) => {
      settleDurationMs = parseFloat(e.target.value) * 1000;
      updateSettleDelayLabel(e.target.value);
    });

    // Region overlay canvas: mouse/touch events for drawing
    regionOverlayCanvas.addEventListener('mousedown', onSelectionMouseDown);
    regionOverlayCanvas.addEventListener('mousemove', onSelectionMouseMove);
    regionOverlayCanvas.addEventListener('mouseup',   onSelectionMouseUp);

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (isSelectingRegion) cancelRegionSelection();
        else closeLightbox();
      }
      if ((e.code === 'Space' || e.key === ' ') && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        captureSlide('manual');
      }
      if (!lightboxModal.classList.contains('hidden')) {
        if (e.key === 'ArrowRight') navigateLightbox(-1);
        if (e.key === 'ArrowLeft')  navigateLightbox(1);
      }
    });

    // Lightbox
    closeLightboxBtn.addEventListener('click', closeLightbox);
    lightboxModal.addEventListener('click', (e) => { if (e.target === lightboxModal) closeLightbox(); });
    lightboxPrevBtn.addEventListener('click', () => navigateLightbox(-1));
    lightboxNextBtn.addEventListener('click', () => navigateLightbox(1));
    lightboxDownloadSingleBtn.addEventListener('click', downloadSingleSlide);
  }

  function updateSensitivityLabel(val) {
    let txt = `${val}%`;
    if (val <= 5)       txt += ' (حساسية عالية جداً)';
    else if (val <= 10) txt += ' (متوازنة — موصى بها)';
    else                txt += ' (منخفضة)';
    sensitivityValText.textContent = txt;
  }

  function updateSettleDelayLabel(val) {
    settleDelayValText.textContent = `${parseFloat(val).toFixed(1)} ثانية`;
  }

  // =====================================================================
  //  SCREEN CAPTURE
  // =====================================================================
  async function startScreenCapture() {
    try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 }, cursor: 'never' },
        audio: false
      });
      videoTrack = mediaStream.getVideoTracks()[0];
      liveVideo.srcObject = mediaStream;

      videoTrack.addEventListener('ended', () => {
        stopScreenCapture();
        showToast('تم إيقاف مشاركة الشاشة', 'warning');
      });

      liveVideo.onloadedmetadata = () => {
        liveVideo.play();
        streamResolutionText.textContent = `${liveVideo.videoWidth} × ${liveVideo.videoHeight}`;
        syncOverlayCanvasSize();
        onStreamStarted();
      };
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        showToast(`فشل بدء المشاركة: ${err.message}`, 'error');
      }
    }
  }

  function onStreamStarted() {
    emptyStreamOverlay.classList.add('hidden');
    startCaptureBtn.classList.add('hidden');
    stopCaptureBtn.classList.remove('hidden');
    streamStatusBadge.classList.add('active');
    streamStatusText.textContent = 'مباشر — المراقبة نشطة';

    lastSavedImageData = null;
    previousFrameData  = null;
    isSettling         = false;

    startMonitoringLoop();

    // Capture first slide after 1.5 s warmup
    setTimeout(() => {
      if (mediaStream && liveVideo.videoWidth > 0 && slides.length === 0) {
        captureSlide('auto-first');
      }
    }, 1500);

    showToast('تم بدء المشاركة! يمكنك الآن تحديد منطقة العرض أو البدء مباشرة.', 'success');
  }

  function stopScreenCapture() {
    if (monitorIntervalId) { clearInterval(monitorIntervalId); monitorIntervalId = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; videoTrack = null; }

    liveVideo.srcObject = null;
    emptyStreamOverlay.classList.remove('hidden');
    startCaptureBtn.classList.remove('hidden');
    stopCaptureBtn.classList.add('hidden');
    streamStatusBadge.classList.remove('active');
    streamStatusText.textContent = 'البث غير نشط';
    streamResolutionText.textContent = '--';
    updateDetectorStatus('متوقف', 'idle');
    updateDiffMeter(0);
    cancelRegionSelection();
  }

  // Keep overlay canvas in sync with the rendered size of the video element
  function syncOverlayCanvasSize() {
    const rect = liveVideo.getBoundingClientRect();
    regionOverlayCanvas.width  = rect.width;
    regionOverlayCanvas.height = rect.height;
    // Re-draw the crop box hint if there is one
    if (cropRegion) drawCropBoxOverlay(cropRegion);
  }

  // =====================================================================
  //  REGION SELECTION  (click "تحديد منطقة العرض")
  // =====================================================================
  function startRegionSelection() {
    if (!mediaStream) {
      showToast('يرجى بدء مشاركة الشاشة أولاً', 'warning');
      return;
    }
    isSelectingRegion = true;
    selectionStart    = null;

    // Show overlay canvas on top of video in crosshair mode
    syncOverlayCanvasSize();
    regionOverlayCtx.clearRect(0, 0, regionOverlayCanvas.width, regionOverlayCanvas.height);
    regionOverlayCanvas.classList.add('selecting');
    regionInstructionBar.classList.remove('hidden');
    selectRegionBtn.disabled = true;

    showToast('اسحب على منطقة العرض التقديمي لتحديدها — اضغط Esc للإلغاء', 'info');
  }

  function cancelRegionSelection() {
    isSelectingRegion = false;
    selectionStart    = null;
    regionOverlayCanvas.classList.remove('selecting');
    regionOverlayCtx.clearRect(0, 0, regionOverlayCanvas.width, regionOverlayCanvas.height);
    regionInstructionBar.classList.add('hidden');
    selectRegionBtn.disabled = false;
  }

  function clearCropRegion() {
    cropRegion = null;
    cropBox.classList.add('hidden');
    regionIndicator.classList.add('hidden');
    clearRegionBtn.classList.add('hidden');
    selectRegionBtn.classList.remove('hidden');
    cropRegionText.textContent = 'الشاشة كاملة';
    // Reset saved reference so first re-capture after clear works correctly
    lastSavedImageData = null;
    showToast('تم إلغاء تحديد المنطقة — سيتم التقاط الشاشة كاملة', 'info');
  }

  // --- Mouse events on the overlay canvas ---
  function onSelectionMouseDown(e) {
    if (!isSelectingRegion) return;
    const { vx, vy } = displayToVideoCoords(e.offsetX, e.offsetY);
    selectionStart = { vx, vy, dx: e.offsetX, dy: e.offsetY };
  }

  function onSelectionMouseMove(e) {
    if (!isSelectingRegion || !selectionStart) return;

    const dx = e.offsetX;
    const dy = e.offsetY;
    const sx = selectionStart.dx;
    const sy = selectionStart.dy;

    // Draw the live selection rectangle on the overlay canvas
    regionOverlayCtx.clearRect(0, 0, regionOverlayCanvas.width, regionOverlayCanvas.height);

    // Dim everything outside selection
    regionOverlayCtx.fillStyle = 'rgba(0,0,0,0.45)';
    regionOverlayCtx.fillRect(0, 0, regionOverlayCanvas.width, regionOverlayCanvas.height);

    // Clear inside the selection (show original video)
    const rx = Math.min(sx, dx), ry = Math.min(sy, dy);
    const rw = Math.abs(dx - sx), rh = Math.abs(dy - sy);
    regionOverlayCtx.clearRect(rx, ry, rw, rh);

    // Draw border around selection
    regionOverlayCtx.strokeStyle = '#38bdf8';
    regionOverlayCtx.lineWidth   = 2;
    regionOverlayCtx.setLineDash([6, 3]);
    regionOverlayCtx.strokeRect(rx, ry, rw, rh);

    // Corner label
    regionOverlayCtx.setLineDash([]);
    regionOverlayCtx.fillStyle = '#38bdf8';
    regionOverlayCtx.font      = 'bold 11px monospace';
    regionOverlayCtx.fillText(`${Math.round(rw)} × ${Math.round(rh)} px`, rx + 4, ry + 14);
  }

  function onSelectionMouseUp(e) {
    if (!isSelectingRegion || !selectionStart) return;

    const { vx: ex, vy: ey } = displayToVideoCoords(e.offsetX, e.offsetY);
    const { vx: sx, vy: sy } = selectionStart;

    const x = Math.min(sx, ex);
    const y = Math.min(sy, ey);
    const w = Math.abs(ex - sx);
    const h = Math.abs(ey - sy);

    // Minimum viable selection: at least 50×50 video pixels
    if (w < 50 || h < 50) {
      showToast('المنطقة المحددة صغيرة جداً — يرجى تحديد منطقة أكبر', 'warning');
      cancelRegionSelection();
      return;
    }

    // Clamp to video dimensions
    cropRegion = {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      w: Math.min(liveVideo.videoWidth  - Math.max(0, Math.round(x)), Math.round(w)),
      h: Math.min(liveVideo.videoHeight - Math.max(0, Math.round(y)), Math.round(h))
    };

    cancelRegionSelection();

    // Show the persistent crop-box indicator on the video
    showCropBoxIndicator();

    cropRegionText.textContent = `${cropRegion.w} × ${cropRegion.h} بكسل`;
    regionIndicator.classList.remove('hidden');
    regionIndicatorText.textContent = `منطقة ${cropRegion.w}×${cropRegion.h}`;
    clearRegionBtn.classList.remove('hidden');
    selectRegionBtn.classList.remove('hidden');

    // Reset detector reference so new region comparison starts fresh
    lastSavedImageData = null;

    showToast(`✅ تم تحديد منطقة العرض (${cropRegion.w} × ${cropRegion.h} بكسل) — الآن يلتقط تلك المنطقة فقط!`, 'success');
  }

  // Show the green dashed crop-box div over the video at the right position
  function showCropBoxIndicator() {
    if (!cropRegion) return;
    const stageRect  = liveVideo.getBoundingClientRect();
    const renderedW  = liveVideo.videoWidth;
    const renderedH  = liveVideo.videoHeight;

    // The video element uses object-fit:contain, so we need to find the actual
    // rendered area inside the video element (letterbox offsets)
    const containerW = stageRect.width;
    const containerH = stageRect.height;
    const videoAspect = renderedW / renderedH;
    const containerAspect = containerW / containerH;

    let drawW, drawH, offsetX, offsetY;
    if (videoAspect > containerAspect) {
      drawW  = containerW;
      drawH  = containerW / videoAspect;
      offsetX = 0;
      offsetY = (containerH - drawH) / 2;
    } else {
      drawH  = containerH;
      drawW  = containerH * videoAspect;
      offsetX = (containerW - drawW) / 2;
      offsetY = 0;
    }

    const scaleX = drawW / renderedW;
    const scaleY = drawH / renderedH;

    cropBox.style.left   = `${offsetX + cropRegion.x * scaleX}px`;
    cropBox.style.top    = `${offsetY + cropRegion.y * scaleY}px`;
    cropBox.style.width  = `${cropRegion.w * scaleX}px`;
    cropBox.style.height = `${cropRegion.h * scaleY}px`;
    cropBox.classList.remove('hidden');
  }

  // Convert display (canvas pixel) coords → video pixel coords
  function displayToVideoCoords(dx, dy) {
    const vw = liveVideo.videoWidth;
    const vh = liveVideo.videoHeight;
    const cw = regionOverlayCanvas.width;
    const ch = regionOverlayCanvas.height;

    // Compute letterbox offsets (object-fit:contain)
    const videoAspect     = vw / vh;
    const containerAspect = cw / ch;

    let drawW, drawH, padX, padY;
    if (videoAspect > containerAspect) {
      drawW = cw; drawH = cw / videoAspect;
      padX  = 0;  padY  = (ch - drawH) / 2;
    } else {
      drawH = ch; drawW = ch * videoAspect;
      padY  = 0;  padX  = (cw - drawW) / 2;
    }

    const vx = ((dx - padX) / drawW) * vw;
    const vy = ((dy - padY) / drawH) * vh;
    return { vx, vy };
  }

  // =====================================================================
  //  FRAME ANALYSIS (called every 250ms)
  // =====================================================================
  function startMonitoringLoop() {
    if (monitorIntervalId) clearInterval(monitorIntervalId);
    monitorIntervalId = setInterval(() => {
      if (!mediaStream || liveVideo.readyState < 2) return;
      analyzeCurrentFrame();
    }, 250);
  }

  function analyzeCurrentFrame() {
    if (!isAutoCaptureEnabled) {
      updateDetectorStatus('الالتقاط التلقائي متوقف مؤقتاً', 'idle');
      return;
    }

    // Draw the region-of-interest (or full frame) into the low-res analysis canvas
    drawToAnalysisCanvas();
    const currentImageData = analysisCtx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);

    if (!lastSavedImageData) {
      updateDetectorStatus('جاهز لالتقاط الشريحة الأولى', 'monitoring');
      return;
    }

    const diffFromSaved = calcDiffPct(currentImageData.data, lastSavedImageData.data);
    updateDiffMeter(diffFromSaved);

    let motionDelta = 0;
    if (previousFrameData) {
      motionDelta = calcDiffPct(currentImageData.data, previousFrameData.data);
    }
    previousFrameData = currentImageData;

    const now = Date.now();

    if (diffFromSaved >= diffThresholdPct) {
      if (!isSettling) {
        isSettling     = true;
        settleStartTime = now;
        updateDetectorStatus(`رُصد تغيير (${diffFromSaved.toFixed(0)}%) — انتظار الاستقرار...`, 'settling');
      } else {
        const elapsed       = now - settleStartTime;
        const isStillMoving = motionDelta > 1.2;

        if (isStillMoving) {
          settleStartTime = now - (settleDurationMs * 0.4);
          updateDetectorStatus(`انتقال الشريحة جارٍ (${diffFromSaved.toFixed(0)}%)...`, 'settling');
        } else if (elapsed >= settleDurationMs) {
          captureSlide('auto');
          isSettling = false;
        } else {
          const rem = ((settleDurationMs - elapsed) / 1000).toFixed(1);
          updateDetectorStatus(`استقرار... (${rem} ثانية)`, 'settling');
        }
      }
    } else {
      if (isSettling) isSettling = false;
      updateDetectorStatus('مراقبة — الشريحة مستقرة', 'monitoring');
    }
  }

  // Draw the crop region (or full video) into the 160×90 analysis canvas
  function drawToAnalysisCanvas() {
    if (cropRegion) {
      analysisCtx.drawImage(
        liveVideo,
        cropRegion.x, cropRegion.y, cropRegion.w, cropRegion.h,  // source rect
        0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT                     // dest
      );
    } else {
      analysisCtx.drawImage(liveVideo, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    }
  }

  function calcDiffPct(a, b) {
    let diff = 0;
    const total = ANALYSIS_WIDTH * ANALYSIS_HEIGHT;
    for (let i = 0; i < a.length; i += 4) {
      const avg = (Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2])) / 3;
      if (avg > 22) diff++;
    }
    return (diff / total) * 100;
  }

  // =====================================================================
  //  SNAPSHOT CAPTURE
  // =====================================================================
  function captureSlide(reason = 'manual') {
    if (!mediaStream || liveVideo.readyState < 2) {
      showToast('يرجى بدء مشاركة الشاشة أولاً', 'warning');
      return;
    }

    let srcX, srcY, srcW, srcH;
    if (cropRegion) {
      srcX = cropRegion.x;
      srcY = cropRegion.y;
      srcW = cropRegion.w;
      srcH = cropRegion.h;
    } else {
      srcX = 0;
      srcY = 0;
      srcW = liveVideo.videoWidth;
      srcH = liveVideo.videoHeight;
    }

    if (srcW === 0 || srcH === 0) return;

    // Draw only the selected region at full native resolution
    snapshotCanvas.width  = srcW;
    snapshotCanvas.height = srcH;
    snapshotCtx.drawImage(liveVideo, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    const dataUrl = snapshotCanvas.toDataURL('image/jpeg', 0.94);

    // Update reference for the analysis canvas
    drawToAnalysisCanvas();
    lastSavedImageData = analysisCtx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);

    const now          = new Date();
    const timeString   = now.toLocaleTimeString('ar-EG', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const slide = {
      id:         'slide_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      index:      slides.length + 1,
      dataUrl,
      width:      srcW,
      height:     srcH,
      timeString,
      timestamp:  now.getTime()
    };

    slides.push(slide);
    triggerShutterFlash();
    if (isSoundEnabled) playShutterSound();
    renderSlideCard(slide);
    updateDeckCounters();

    lastSnapTimeText.textContent = timeString;
    updateDetectorStatus('تم التقاط الشريحة بنجاح! 📸', 'snapped');
    showToast(`تم التقاط الشريحة #${slide.index} ${reason === 'manual' ? 'يدوياً' : 'تلقائياً'}${cropRegion ? ' (منطقة محددة)' : ''}`, 'success');
  }

  // =====================================================================
  //  UI HELPERS
  // =====================================================================
  function triggerShutterFlash() {
    shutterFlash.classList.remove('active');
    void shutterFlash.offsetWidth;
    shutterFlash.classList.add('active');
  }

  function playShutterSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const bufSz  = audioCtx.sampleRate * 0.04;
      const buf    = audioCtx.createBuffer(1, bufSz, audioCtx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufSz; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSz * 0.25));

      const play = (when, vol) => {
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const filt = audioCtx.createBiquadFilter();
        filt.type = 'highpass'; filt.frequency.value = 800;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, when);
        gain.gain.exponentialRampToValueAtTime(0.01, when + 0.04);
        src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
        src.start(when);
      };

      play(audioCtx.currentTime, 0.3);
      play(audioCtx.currentTime + 0.065, 0.4);
    } catch (e) { /* silent fail */ }
  }

  function updateDiffMeter(pct) {
    const c = Math.min(Math.max(pct, 0), 100);
    diffMeterFill.style.width  = `${c}%`;
    diffMeterText.textContent  = `${c.toFixed(0)}%`;
  }

  function updateDetectorStatus(text, cls) {
    detectorStatusText.textContent = text;
    detectorStatusText.className   = `info-val detector-${cls}`;
  }

  function updateDeckCounters() {
    const n = slides.length;
    slideCountBadge.textContent = n;
    deckCountBadge.textContent  = `${n} ${n <= 2 ? 'شريحة' : 'شرائح'}`;
    const hasSlides = n > 0;
    exportPdfBtn.disabled   = !hasSlides;
    quickExportBtn.disabled = !hasSlides;
    clearAllBtn.disabled    = !hasSlides;
    emptyGallery.classList.toggle('hidden', hasSlides);
  }

  // =====================================================================
  //  GALLERY
  // =====================================================================
  function renderSlideCard(slide) {
    const card = document.createElement('div');
    card.className = 'slide-card';
    card.id = `card_${slide.id}`;
    card.innerHTML = `
      <div class="slide-thumb-wrap" onclick="window.SlideSnapApp.openLightbox('${slide.id}')">
        <img src="${slide.dataUrl}" alt="شريحة ${slide.index}" class="slide-thumb" loading="lazy">
        <span class="slide-badge-num">#${slide.index}</span>
        <div class="slide-thumb-overlay">
          <button class="overlay-btn" title="معاينة" onclick="event.stopPropagation(); window.SlideSnapApp.openLightbox('${slide.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
            </svg>
          </button>
        </div>
      </div>
      <div class="slide-info">
        <span class="slide-time">${slide.timeString}</span>
        <button class="slide-card-delete" title="حذف" onclick="window.SlideSnapApp.deleteSlide('${slide.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
    slidesGrid.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function reRenderAllCards() {
    slidesGrid.innerHTML = '';
    slides.forEach((s, i) => { s.index = i + 1; renderSlideCard(s); });
    updateDeckCounters();
  }

  function deleteSlide(slideId) {
    const idx = slides.findIndex(s => s.id === slideId);
    if (idx !== -1) {
      const rem = slides.splice(idx, 1)[0];
      reRenderAllCards();
      showToast(`تم حذف الشريحة #${rem.index}`, 'info');
    }
  }

  function confirmClearAll() {
    if (slides.length === 0) return;
    if (confirm(`هل تريد حذف جميع الشرائح المُلتقطة (${slides.length} شريحة)؟`)) {
      slides = []; lastSavedImageData = null; reRenderAllCards();
      showToast('تم مسح جميع الشرائح.', 'info');
    }
  }

  // =====================================================================
  //  LIGHTBOX
  // =====================================================================
  function openLightbox(slideId) {
    const idx = slides.findIndex(s => s.id === slideId);
    if (idx === -1) return;
    currentLightboxIndex = idx;
    updateLightboxContent();
    lightboxModal.classList.remove('hidden');
  }

  function updateLightboxContent() {
    if (currentLightboxIndex < 0 || currentLightboxIndex >= slides.length) return;
    const s = slides[currentLightboxIndex];
    lightboxImg.src = s.dataUrl;
    lightboxTitle.textContent = `معاينة الشريحة #${s.index} من ${slides.length} — (${s.width}×${s.height} بكسل)`;
    lightboxPrevBtn.disabled = currentLightboxIndex === 0;
    lightboxNextBtn.disabled = currentLightboxIndex === slides.length - 1;
  }

  function navigateLightbox(delta) {
    const n = currentLightboxIndex + delta;
    if (n >= 0 && n < slides.length) { currentLightboxIndex = n; updateLightboxContent(); }
  }

  function closeLightbox() { lightboxModal.classList.add('hidden'); currentLightboxIndex = -1; }

  function downloadSingleSlide() {
    if (currentLightboxIndex < 0) return;
    const s = slides[currentLightboxIndex];
    const a = document.createElement('a');
    a.href = s.dataUrl; a.download = `slide_${s.index}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // =====================================================================
  //  PDF EXPORT
  // =====================================================================
  async function generatePdf() {
    if (slides.length === 0) { showToast('لا توجد شرائح لتصديرها!', 'warning'); return; }

    const jsPDF = window.jspdf ? window.jspdf.jsPDF : null;
    if (!jsPDF) { showToast('تعذر تحميل مكتبة jsPDF', 'error'); return; }

    const rawName   = pdfFileNameInput.value.trim() || 'Presentation_Slides';
    const cleanName = rawName.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_');

    exportProgressModal.classList.remove('hidden');
    exportProgressBar.style.width = '0%';
    exportProgressPct.textContent = '0%';
    exportProgressTitle.textContent = 'جاري تجميع ملف الـ PDF...';
    await new Promise(r => setTimeout(r, 100));

    try {
      const sample       = slides[0];
      const isLandscape  = sample.width >= sample.height;
      const orientation  = isLandscape ? 'l' : 'p';
      const pageW        = isLandscape ? 297 : 210;
      const pageH        = isLandscape ? (297 * (sample.height / sample.width)) : (210 * (sample.height / sample.width));

      const pdf = new jsPDF({ orientation, unit: 'mm', format: [pageW, pageH], compress: true });

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([pageW, pageH], orientation);
        pdf.addImage(slides[i].dataUrl, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
        const pct = Math.round(((i + 1) / slides.length) * 100);
        exportProgressBar.style.width = `${pct}%`;
        exportProgressPct.textContent = `${pct}%`;
        if (i % 3 === 0) await new Promise(r => setTimeout(r, 15));
      }

      exportProgressTitle.textContent = 'جاري حفظ الملف...';
      await new Promise(r => setTimeout(r, 100));

      const finalName = `${cleanName}.pdf`;
      pdf.save(finalName);

      // Also save a copy to D:\pptx\output\ via local server API
      try {
        fetch('/api/save-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: finalName, pdfBase64: pdf.output('datauristring') })
        }).then(r => r.json()).then(d => {
          if (d.success) console.log('Saved copy to disk:', d.fullPath);
        });
      } catch (_) {}

      setTimeout(() => {
        exportProgressModal.classList.add('hidden');
        showToast(`🎉 تم تصدير ${slides.length} شريحة بنجاح إلى "${finalName}"!`, 'success');
      }, 500);

    } catch (err) {
      exportProgressModal.classList.add('hidden');
      showToast(`فشل تصدير الـ PDF: ${err.message}`, 'error');
    }
  }

  // =====================================================================
  //  TOAST NOTIFICATIONS
  // =====================================================================
  function showToast(message, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icon = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' }[type] || 'ℹ️';
    t.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity   = '0';
      t.style.transform = 'translateY(10px)';
      t.style.transition = 'all 0.3s ease';
      setTimeout(() => t.remove(), 300);
    }, 4500);
  }

  // =====================================================================
  //  GLOBAL API (for inline onclick handlers)
  // =====================================================================
  window.SlideSnapApp = { openLightbox, deleteSlide };

  document.addEventListener('DOMContentLoaded', init);

})();
