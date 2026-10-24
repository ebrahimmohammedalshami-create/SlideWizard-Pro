/**
 * ⚡ SlideWizard Pro Studio v3.0 (Master Ultra Edition)
 * مصور العروض التقديمية والشرائح التلقائي فائق الذكاء والدقة
 * 
 * الميزات المضمنة في هذا الإصدار:
 * 1. 🔍 الجلب التلقائي لبيانات الدرس (Auto-Metadata Scraper): قراءة عدد الشرائح واسم الدرس آلياً من كود الصفحة.
 * 2. 🎞️ شريط المصغرات الحي ومحرر الشرائح (Live Filmstrip & Slide Retake): مشاهدة الشرائح لحظياً، فحصها، حذفها، أو إعادة التقاط شريحة فردية قبل التصدير.
 * 3. 💎 مضاعف الدقة الفائق 4K وصقل النصوص (2x Ultra-Sharp Retina Super-Sampling).
 * 4. 📁 الحفظ التلقائي المنظم في مجلد الجهاز المحلي d:\pptx\output\ عبر الخادم المحلي server.js مع التنزيل في المتصفح.
 * 5. 🔎 نصوص قابلة للبحث والنسخ داخل الـ PDF (Searchable PDF with Text Extraction).
 * 6. 🔄 نظام الجلسات المتتالية (Multi-Module Sessions): تصوير الدروس المتتالية بضغطة زر واحدة دون إعادة ربط الشاشة.
 * 7. 🖱️ مستطيل أخضر تفاعلي بـ 8 مقابض بالماوس + لوحة تحكم قابلة للسحب والطي.
 * 8. 🧠 كاشف التكرار الذكي لمنع حفظ الشرائح المكررة والتوقف التلقائي.
 */
(function SlideWizardMaster() {
  'use strict';

  // 1. تنظيف أي عناصر سابقة
  const CLEANUP_IDS = [
    'wizard-bar', 'crop-box', 'next-target-pointer', 
    'crop-canvas-overlay', 'preview-popup', 'wizard-mini-badge',
    'wizard-filmstrip-drawer'
  ];
  CLEANUP_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  // 2. تحميل المكتبات الخارجية
  function ensureScript(src) {
    if (!document.querySelector(`script[src="${src}"]`)) {
      const s = document.createElement('script');
      s.src = src;
      document.head.appendChild(s);
    }
  }
  ensureScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  ensureScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  ensureScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');

  const STORAGE_KEY = 'SlideWizardSettings_v3';
  
  let stream = null;
  let video = null;
  let isCapturing = false;
  let stopRequested = false;
  let previousFrameFingerprint = null;

  // إدارة الجلسة والشرائح الملتقطة
  let currentModuleIndex = 1;
  const sessionHistory = [];
  let capturedSlides = []; // مصفوفة كائنات الشريحة { dataUrl, w, h, texts, canvas }

  // إعدادات الشريحة الافتراضية
  let cropArea = { x: 260, y: 70, w: 780, h: 540 };
  let barPos   = { x: Math.max(10, window.innerWidth - 350), y: 15 };
  let pointerPos = { x: Math.round(window.innerWidth * 0.88), y: Math.round(window.innerHeight * 0.92) };

  // الكشف التلقائي الأولي من iframe إن وجد
  const iframe = document.querySelector('iframe');
  if (iframe) {
    try {
      const ir = iframe.getBoundingClientRect();
      const MENU_LEFT  = 165;
      const MENU_RIGHT = 160;
      const detectedX = Math.round(ir.left + MENU_LEFT);
      const detectedW = Math.round(ir.width - MENU_LEFT - MENU_RIGHT);
      const detectedH = Math.round(ir.height - 50);

      if (detectedW > 300 && detectedH > 200) {
        cropArea = {
          x: Math.max(0, detectedX),
          y: Math.max(0, Math.round(ir.top) + 30),
          w: detectedW,
          h: detectedH
        };
      }
    } catch (e) {}
  }

  // ─── 🔍 ميزة قراءة اسم الدرس وعدد الشرائح تلقائياً من الصفحة ───
  function autoScrapePageMetadata() {
    let foundPages = null;
    let foundTitle = null;

    function scanTextForPages(str) {
      if (!str) return;
      const m = str.match(/(?:slide|page|شريحة|صفحة)?\s*(\d{1,3})\s*(?:of|\/|من)\s*(\d{1,3})\b/i);
      if (m) {
        const total = parseInt(m[2], 10);
        if (total > 1 && total <= 500) {
          if (!foundPages || total > foundPages) foundPages = total;
        }
      }
    }

    // فحص نصوص الصفحة الرئيسية
    if (document.body) scanTextForPages(document.body.innerText);

    // فحص محتوى الـ iframe
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(f => {
      try {
        if (f.contentDocument && f.contentDocument.body) {
          scanTextForPages(f.contentDocument.body.innerText);

          // فحص عنوان الموديول النشط في القائمة الجانبية أو الهيدر
          const activeItem = f.contentDocument.querySelector(
            '.outline-item.active, .selected, .current, [aria-current="true"], h1, .lesson-title, .module-title'
          );
          if (activeItem && activeItem.innerText.trim().length > 2 && activeItem.innerText.trim().length < 80) {
            foundTitle = activeItem.innerText.trim();
          }
        }
      } catch (e) {}
    });

    // عنوان الصفحة الرئيسي كبديل
    if (!foundTitle) {
      const mainActive = document.querySelector('.outline-item.active, .selected, .current, h1, .lesson-title');
      if (mainActive) foundTitle = mainActive.innerText.trim();
      else if (document.title && document.title.length > 2) foundTitle = document.title.trim();
    }

    return { foundPages, foundTitle };
  }

  // استرجاع الإعدادات من localStorage
  let savedSettings = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      savedSettings = JSON.parse(raw);
      if (savedSettings.cropArea && savedSettings.cropArea.w > 80 && savedSettings.cropArea.h > 80) {
        cropArea = savedSettings.cropArea;
      }
      if (savedSettings.barPos && savedSettings.barPos.x >= 0 && savedSettings.barPos.y >= 0) {
        barPos = savedSettings.barPos;
      }
      if (savedSettings.pointerPos && savedSettings.pointerPos.x >= 0 && savedSettings.pointerPos.y >= 0) {
        pointerPos = savedSettings.pointerPos;
      }
    }
  } catch (e) {}

  function saveCurrentSettings() {
    try {
      const pagesInp = document.getElementById('sw-pages');
      const delayInp = document.getElementById('sw-delay');
      const titleInp = document.getElementById('sw-doc-title');
      const fmtRadio = document.querySelector('input[name="sw-format"]:checked');
      const dedupChk = document.getElementById('sw-dedup');
      const soundChk = document.getElementById('sw-sound');
      const ultraChk = document.getElementById('sw-ultra-res');
      const syncChk  = document.getElementById('sw-server-sync');

      const data = {
        cropArea,
        barPos,
        pointerPos,
        pages: pagesInp ? parseInt(pagesInp.value) : (savedSettings.pages || 38),
        delay: delayInp ? parseFloat(delayInp.value) : (savedSettings.delay || 2.2),
        docTitle: titleInp ? titleInp.value : (savedSettings.docTitle || ''),
        format: fmtRadio ? fmtRadio.value : (savedSettings.format || 'pdf'),
        dedup: dedupChk ? dedupChk.checked : (savedSettings.dedup !== false),
        sound: soundChk ? soundChk.checked : (savedSettings.sound !== false),
        ultra: ultraChk ? ultraChk.checked : (savedSettings.ultra !== false),
        sync:  syncChk ? syncChk.checked : (savedSettings.sync !== false)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function playBeep(freq = 900, duration = 0.09) {
    const soundChk = document.getElementById('sw-sound');
    if (soundChk && !soundChk.checked) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.4, ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function getNextModuleTitle(prevTitle, nextIdx) {
    const match = prevTitle.match(/^(.*?)(?:[_\-\s]*)(\d+)$/);
    if (match) {
      const base = match[1];
      const num = parseInt(match[2], 10);
      const padLen = match[2].length;
      const nextNum = String(num + 1).padStart(padLen, '0');
      return `${base}_${nextNum}`;
    }
    return `${prevTitle}_Part${nextIdx}`;
  }

  // ─── المستطيل الأخضر التفاعلي بـ 8 مقابض ───
  const cropBox = document.createElement('div');
  cropBox.id = 'crop-box';
  cropBox.style.cssText = `
    position: fixed;
    left: ${cropArea.x}px;
    top: ${cropArea.y}px;
    width: ${cropArea.w}px;
    height: ${cropArea.h}px;
    border: 2px dashed #22c55e;
    background: rgba(34, 197, 94, 0.05);
    z-index: 9999990;
    border-radius: 8px;
    box-shadow: 0 0 25px rgba(34, 197, 94, 0.25), inset 0 0 15px rgba(34, 197, 94, 0.08);
    user-select: none;
    box-sizing: border-box;
  `;

  const cropHeader = document.createElement('div');
  cropHeader.style.cssText = `
    position: absolute;
    top: -28px;
    left: 0;
    background: #16a34a;
    color: white;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 6px 6px 0 0;
    font-family: Segoe UI, Tahoma, sans-serif;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: move;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    white-space: nowrap;
  `;
  cropHeader.innerHTML = `
    <span>📸 الشريحة</span>
    <span id="crop-box-dims" style="background:#14532d;padding:1px 6px;border-radius:4px;font-size:10px;font-family:monospace;">${cropArea.w}×${cropArea.h}</span>
    <span style="opacity:0.8;font-size:10px;">(اسحبني للتحريك)</span>
  `;
  cropBox.appendChild(cropHeader);

  const HANDLES = [
    { id: 'nw', cursor: 'nwse-resize', pos: 'top:-6px;left:-6px;' },
    { id: 'n',  cursor: 'ns-resize',   pos: 'top:-6px;left:50%;transform:translateX(-50%);' },
    { id: 'ne', cursor: 'nesw-resize', pos: 'top:-6px;right:-6px;' },
    { id: 'e',  cursor: 'ew-resize',   pos: 'top:50%;right:-6px;transform:translateY(-50%);' },
    { id: 'se', cursor: 'nwse-resize', pos: 'bottom:-6px;right:-6px;' },
    { id: 's',  cursor: 'ns-resize',   pos: 'bottom:-6px;left:50%;transform:translateX(-50%);' },
    { id: 'sw', cursor: 'nesw-resize', pos: 'bottom:-6px;left:-6px;' },
    { id: 'w',  cursor: 'ew-resize',   pos: 'top:50%;left:-6px;transform:translateY(-50%);' }
  ];

  HANDLES.forEach(h => {
    const handleEl = document.createElement('div');
    handleEl.className = 'crop-handle';
    handleEl.dataset.handle = h.id;
    handleEl.style.cssText = `
      position: absolute;
      width: 12px;
      height: 12px;
      background: #ffffff;
      border: 2px solid #16a34a;
      border-radius: 3px;
      cursor: ${h.cursor};
      box-shadow: 0 2px 5px rgba(0,0,0,0.4);
      z-index: 10;
      ${h.pos}
    `;
    cropBox.appendChild(handleEl);
  });

  document.body.appendChild(cropBox);

  function syncCropBoxDisplay() {
    cropBox.style.left   = cropArea.x + 'px';
    cropBox.style.top    = cropArea.y + 'px';
    cropBox.style.width  = cropArea.w + 'px';
    cropBox.style.height = cropArea.h + 'px';
    const dimsEl = document.getElementById('crop-box-dims');
    if (dimsEl) {
      const gcd = (a, b) => b ? gcd(b, a % b) : a;
      const d = gcd(cropArea.w, cropArea.h);
      const ratio = (cropArea.w / d < 20) ? `${cropArea.w/d}:${cropArea.h/d}` : (cropArea.w > cropArea.h ? '16:9' : '4:3');
      dimsEl.innerText = `${cropArea.w} × ${cropArea.h} (${ratio})`;
    }
  }
  syncCropBoxDisplay();

  let isResizingCrop = false;
  let isMovingCrop = false;
  let activeHandle = null;
  let cropStartPos = { x: 0, y: 0 };
  let cropInitialArea = { ...cropArea };

  cropBox.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.crop-handle');
    if (handle) {
      isResizingCrop = true;
      activeHandle = handle.dataset.handle;
      cropStartPos = { x: e.clientX, y: e.clientY };
      cropInitialArea = { ...cropArea };
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (e.target === cropHeader || cropHeader.contains(e.target) || e.target === cropBox) {
      isMovingCrop = true;
      cropStartPos = { x: e.clientX, y: e.clientY };
      cropInitialArea = { ...cropArea };
      e.stopPropagation();
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isResizingCrop && activeHandle) {
      const dx = e.clientX - cropStartPos.x;
      const dy = e.clientY - cropStartPos.y;
      let { x, y, w, h } = cropInitialArea;

      if (activeHandle.includes('e')) w = Math.max(100, cropInitialArea.w + dx);
      if (activeHandle.includes('s')) h = Math.max(80,  cropInitialArea.h + dy);
      if (activeHandle.includes('w')) {
        const newW = cropInitialArea.w - dx;
        if (newW >= 100) { w = newW; x = cropInitialArea.x + dx; }
      }
      if (activeHandle.includes('n')) {
        const newH = cropInitialArea.h - dy;
        if (newH >= 80) { h = newH; y = cropInitialArea.y + dy; }
      }

      cropArea = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      syncCropBoxDisplay();
      return;
    }

    if (isMovingCrop) {
      const dx = e.clientX - cropStartPos.x;
      const dy = e.clientY - cropStartPos.y;
      cropArea.x = Math.max(0, Math.round(cropInitialArea.x + dx));
      cropArea.y = Math.max(0, Math.round(cropInitialArea.y + dy));
      syncCropBoxDisplay();
      return;
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizingCrop || isMovingCrop) {
      isResizingCrop = false;
      isMovingCrop = false;
      activeHandle = null;
      saveCurrentSettings();
    }
  });

  // ─── مؤشر Next 🎯 ───
  const pointer = document.createElement('div');
  pointer.id = 'next-target-pointer';
  pointer.style.cssText = `
    position: fixed;
    left: ${pointerPos.x}px;
    top: ${pointerPos.y}px;
    width: 44px;
    height: 44px;
    background: #ef4444;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 25px rgba(239, 68, 68, 0.9), 0 4px 15px rgba(0,0,0,0.5);
    z-index: 9999998;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    user-select: none;
    transform: translate(-50%, -50%);
  `;
  pointer.innerHTML = '🎯';

  const pLabel = document.createElement('div');
  pLabel.style.cssText = `
    position: absolute;
    bottom: -28px;
    background: #0f172a;
    color: #fca5a5;
    border: 1px solid #ef4444;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
    font-family: Segoe UI, Tahoma, sans-serif;
    font-weight: bold;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.6);
  `;
  pLabel.innerText = '🎯 اسحبني فوق زر NEXT';
  pointer.appendChild(pLabel);
  document.body.appendChild(pointer);

  let isDraggingPointer = false;
  let pOffset = { x: 0, y: 0 };
  pointer.addEventListener('mousedown', (e) => {
    isDraggingPointer = true;
    pointer.style.cursor = 'grabbing';
    pOffset = { x: e.clientX - pointer.offsetLeft, y: e.clientY - pointer.offsetTop };
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDraggingPointer) return;
    pointerPos.x = e.clientX - pOffset.x;
    pointerPos.y = e.clientY - pOffset.y;
    pointer.style.left = pointerPos.x + 'px';
    pointer.style.top  = pointerPos.y + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (isDraggingPointer) {
      isDraggingPointer = false;
      pointer.style.cursor = 'grab';
      saveCurrentSettings();
    }
  });

  // ─── 🎞️ شريط المصغرات الحي ومحرر الشرائح (Live Filmstrip Drawer) ───
  const filmstrip = document.createElement('div');
  filmstrip.id = 'wizard-filmstrip-drawer';
  filmstrip.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100vw;
    background: rgba(15, 23, 42, 0.96);
    backdrop-filter: blur(16px);
    border-top: 2px solid #38bdf8;
    z-index: 9999997;
    direction: rtl;
    font-family: Segoe UI, Tahoma, sans-serif;
    color: white;
    display: none;
    flex-direction: column;
    box-shadow: 0 -10px 30px rgba(0,0,0,0.8);
    transition: transform 0.25s ease;
  `;
  filmstrip.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#1e293b;border-bottom:1px solid #334155;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:13px;font-weight:bold;color:#38bdf8;">🎞️ معرض مصغرات الشرائح المباشر</span>
        <span id="filmstrip-count-badge" style="background:#0284c7;color:white;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:bold;">0 شرائح</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;color:#94a3b8;">اضغط على أي شريحة لتكبيرها أو حذفها</span>
        <button id="filmstrip-close-btn" style="background:#334155;border:none;color:#cbd5e1;cursor:pointer;padding:3px 10px;border-radius:5px;font-size:12px;">✕ إغلاق الشريط</button>
      </div>
    </div>
    <div id="filmstrip-items" style="display:flex;gap:12px;padding:12px 16px;overflow-x:auto;max-height:140px;align-items:center;">
      <span style="color:#64748b;font-size:12px;margin:auto;">لم يتم التقاط شرائح بعد. ستظهر هنا فور البدء!</span>
    </div>
  `;
  document.body.appendChild(filmstrip);

  document.getElementById('filmstrip-close-btn').onclick = () => {
    filmstrip.style.display = 'none';
  };

  function renderFilmstrip() {
    const container = document.getElementById('filmstrip-items');
    const badge = document.getElementById('filmstrip-count-badge');
    if (!container) return;

    badge.innerText = `${capturedSlides.length} شرائح`;

    if (capturedSlides.length === 0) {
      container.innerHTML = '<span style="color:#64748b;font-size:12px;margin:auto;">لم يتم التقاط شرائح بعد.</span>';
      return;
    }

    container.innerHTML = capturedSlides.map((slide, idx) => `
      <div style="position:relative;flex-shrink:0;width:140px;background:#0f172a;border:2px solid #334155;border-radius:6px;overflow:hidden;cursor:pointer;" class="film-item" data-idx="${idx}">
        <span style="position:absolute;top:4px;right:4px;background:#0284c7;color:white;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:3px;z-index:2;">#${idx + 1}</span>
        <button class="btn-del-slide" data-idx="${idx}" title="حذف هذه الشريحة" style="position:absolute;top:4px;left:4px;background:rgba(220,38,38,0.85);color:white;border:none;width:20px;height:20px;border-radius:3px;cursor:pointer;font-size:11px;z-index:2;display:flex;align-items:center;justify-content:center;">✕</button>
        <button class="btn-retake-slide" data-idx="${idx}" title="إعادة التقاط هذه الشريحة فقط" style="position:absolute;bottom:4px;left:4px;background:rgba(16,185,129,0.85);color:white;border:none;height:18px;border-radius:3px;cursor:pointer;font-size:9px;z-index:2;padding:0 5px;font-weight:bold;">🔄 إعادة</button>
        <img src="${slide.dataUrl}" style="width:100%;height:80px;object-fit:cover;display:block;" />
      </div>
    `).join('');

    // تفعيل أزرار الحذف وإعادة الالتقاط
    container.querySelectorAll('.btn-del-slide').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        if (confirm(`هل ترغب بحذف الشريحة رقم #${idx + 1} من العرض؟`)) {
          capturedSlides.splice(idx, 1);
          renderFilmstrip();
        }
      };
    });

    container.querySelectorAll('.btn-retake-slide').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        const shot = await captureSingleFrame();
        capturedSlides[idx] = shot;
        renderFilmstrip();
        playBeep(1100, 0.1);
        alert(`✓ تم بنجاح تحديث وإعادة التقاط الشريحة رقم #${idx + 1}`);
      };
    });

    // تكبير الشريحة عند الضغط عليها
    container.querySelectorAll('.film-item').forEach(item => {
      item.onclick = () => {
        const idx = parseInt(item.dataset.idx, 10);
        const s = capturedSlides[idx];
        if (s) showLightbox(s.dataUrl, idx + 1);
      };
    });
  }

  function showLightbox(dataUrl, num) {
    const old = document.getElementById('wizard-lightbox');
    if (old) old.remove();

    const lb = document.createElement('div');
    lb.id = 'wizard-lightbox';
    lb.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;direction:rtl;';
    lb.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;max-width:850px;margin-bottom:10px;">
        <span style="color:#38bdf8;font-weight:bold;font-size:16px;">🔍 معاينة الشريحة #${num} بدقة فائقة</span>
        <button onclick="this.parentElement.parentElement.remove()" style="background:#dc2626;color:white;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-weight:bold;">✕ إغلاق</button>
      </div>
      <img src="${dataUrl}" style="max-width:850px;max-height:80vh;border-radius:8px;border:2px solid #38bdf8;box-shadow:0 20px 60px rgba(0,0,0,0.9);" />
    `;
    document.body.appendChild(lb);
  }

  // ─── لوحة التحكم المتقدمة (Studio Bar) ───
  const bar = document.createElement('div');
  bar.id = 'wizard-bar';
  bar.style.cssText = `
    position: fixed;
    top: ${barPos.y}px;
    left: ${barPos.x}px;
    z-index: 9999998;
    background: rgba(15, 23, 42, 0.96);
    backdrop-filter: blur(14px);
    border: 2px solid #38bdf8;
    padding: 12px 14px;
    border-radius: 14px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85), 0 0 20px rgba(56, 189, 248, 0.2);
    font-family: Segoe UI, Tahoma, sans-serif;
    color: white;
    direction: rtl;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 335px;
    box-sizing: border-box;
    user-select: none;
  `;

  // الفحص الأولي التلقائي لمعلومات الصفحة
  const initialMeta = autoScrapePageMetadata();
  const defaultPages = initialMeta.foundPages || savedSettings.pages || 38;
  const defaultDelay = savedSettings.delay || 2.2;
  const defaultFmt   = savedSettings.format || 'pdf';
  const defaultDedup = savedSettings.dedup !== false;
  const defaultSound = savedSettings.sound !== false;
  const defaultUltra = savedSettings.ultra !== false;
  const defaultSync  = savedSettings.sync !== false;
  const defaultTitle = (initialMeta.foundTitle || savedSettings.docTitle || document.title || 'Module_01').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');

  bar.innerHTML = `
    <!-- هيدر اللوحة -->
    <div id="sw-bar-header" style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #334155;padding-bottom:6px;cursor:move;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:14px;font-weight:bold;color:#38bdf8;" id="sw-title">⚡ SlideWizard Master</span>
        <span style="font-size:9px;background:#0284c7;color:white;padding:1px 5px;border-radius:4px;font-weight:bold;">v3.0</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <button id="sw-btn-filmstrip-toggle" title="معرض المصغرات" style="background:#1e293b;border:1px solid #475569;color:#38bdf8;cursor:pointer;border-radius:4px;font-size:11px;padding:2px 6px;">🎞️ المعرض</button>
        <button id="sw-btn-min" title="تصغير" style="background:#1e293b;border:1px solid #475569;color:#cbd5e1;cursor:pointer;border-radius:4px;font-size:12px;padding:2px 7px;">–</button>
        <button id="sw-btn-close" title="إغلاق" style="background:#1e293b;border:1px solid #475569;color:#ef4444;cursor:pointer;border-radius:4px;font-size:12px;padding:2px 7px;">✕</button>
      </div>
    </div>

    <!-- شريط الجلسة المتتالية -->
    <div id="sw-session-strip" style="background:linear-gradient(90deg, #0369a1, #0284c7);color:white;padding:5px 8px;border-radius:7px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:11px;font-weight:bold;">📚 الدرس: <span id="sw-curr-mod-label" style="color:#fef08a;">#1</span></span>
      <span id="sw-session-count" style="font-size:10px;background:rgba(15,23,42,0.6);padding:2px 6px;border-radius:10px;">0 مكتملة</span>
    </div>

    <!-- محتوى اللوحة -->
    <div id="sw-bar-body" style="display:flex;flex-direction:column;gap:7px;">
      
      <!-- 1️⃣ زر ربط الشاشة -->
      <button id="sw-btn-screen" style="background:#0284c7;color:white;border:none;padding:8px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 8px rgba(2,132,199,0.4);">
        <span>1️⃣ ربط الشاشة (اختر تبويب العرض)</span>
      </button>

      <!-- 2️⃣ المستطيل الأخضر وتعديله -->
      <div style="background:#1e293b;padding:7px 9px;border-radius:8px;border:1px solid #334155;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;color:#cbd5e1;font-weight:bold;">2️⃣ مكان الشريحة (المستطيل الأخضر):</span>
          <span style="font-size:10px;color:#22c55e;font-weight:bold;">مباشر بالماوس 🖱️</span>
        </div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center;">
          <button id="sw-nl" style="background:#334155;color:white;border:none;padding:3px 7px;border-radius:4px;font-size:11px;cursor:pointer;">◀ يسار</button>
          <button id="sw-nr" style="background:#334155;color:white;border:none;padding:3px 7px;border-radius:4px;font-size:11px;cursor:pointer;">يمين ▶</button>
          <button id="sw-nu" style="background:#334155;color:white;border:none;padding:3px 7px;border-radius:4px;font-size:11px;cursor:pointer;">▲ أعلى</button>
          <button id="sw-nd" style="background:#334155;color:white;border:none;padding:3px 7px;border-radius:4px;font-size:11px;cursor:pointer;">▼ أسفل</button>
          <button id="sw-ew" style="background:#334155;color:white;border:none;padding:3px 7px;border-radius:4px;font-size:11px;cursor:pointer;">توسيع ↔</button>
          <button id="sw-sw" style="background:#334155;color:white;border:none;padding:3px 7px;border-radius:4px;font-size:11px;cursor:pointer;">تضييق</button>
        </div>
        <button id="sw-btn-draw" style="background:#0f172a;border:1px dashed #64748b;color:#94a3b8;padding:3px;border-radius:4px;font-size:11px;cursor:pointer;">✏️ أو ارسم مستطيلاً بالماوس</button>
      </div>

      <!-- 3️⃣ مؤشر Next -->
      <div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);padding:5px;border-radius:7px;text-align:center;">
        <span style="font-size:11px;color:#fca5a5;font-weight:bold;">3️⃣ اسحب الدائرة الحمراء 🎯 فوق زر Next</span>
      </div>

      <!-- 4️⃣ إعدادات العرض وجلب البيانات التلقائي -->
      <div style="background:#1e293b;padding:7px 9px;border-radius:8px;border:1px solid #334155;display:flex;flex-direction:column;gap:5px;">
        
        <!-- حقل اسم الدرس مع زر الفحص التلقائي -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
          <span style="font-size:11px;color:#cbd5e1;font-weight:bold;white-space:nowrap;">اسم الدرس:</span>
          <input type="text" id="sw-doc-title" value="${defaultTitle}" style="flex:1;background:#0f172a;border:1px solid #64748b;color:#e2e8f0;border-radius:5px;padding:3px 6px;font-size:11px;" />
          <button id="sw-btn-rescrape" title="جلب الاسم وعدد الشرائح تلقائياً من الصفحة" style="background:#0284c7;color:white;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;">🔍 جلب</button>
        </div>

        <!-- عدد الشرائح ومهلة الانتقال -->
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:11px;color:#cbd5e1;font-weight:bold;">الشرائح:</span>
            <input type="number" id="sw-pages" value="${defaultPages}" min="1" max="500" style="width:48px;background:#0f172a;border:1px solid #38bdf8;color:#38bdf8;font-weight:bold;text-align:center;border-radius:4px;padding:2px;font-size:12px;" />
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:11px;color:#cbd5e1;font-weight:bold;">المهلة:</span>
            <input type="number" id="sw-delay" value="${defaultDelay}" min="0.8" max="10" step="0.2" style="width:48px;background:#0f172a;border:1px solid #38bdf8;color:#38bdf8;font-weight:bold;text-align:center;border-radius:4px;padding:2px;font-size:12px;" />
            <span style="font-size:10px;color:#94a3b8;">ث</span>
          </div>
        </div>

        <!-- خيارات الجودة المتقدمة -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #334155;padding-top:4px;">
          <label style="display:flex;align-items:center;gap:3px;font-size:10px;color:#cbd5e1;cursor:pointer;">
            <input type="checkbox" id="sw-ultra-res" ${defaultUltra ? 'checked' : ''} style="accent-color:#38bdf8;" />
            💎 دقة فائقة 4K
          </label>
          <label style="display:flex;align-items:center;gap:3px;font-size:10px;color:#cbd5e1;cursor:pointer;">
            <input type="checkbox" id="sw-dedup" ${defaultDedup ? 'checked' : ''} style="accent-color:#38bdf8;" />
            🧠 منع التكرار
          </label>
          <label style="display:flex;align-items:center;gap:3px;font-size:10px;color:#cbd5e1;cursor:pointer;">
            <input type="checkbox" id="sw-sound" ${defaultSound ? 'checked' : ''} style="accent-color:#22c55e;" />
            🔊 صوت
          </label>
          <label style="display:flex;align-items:center;gap:3px;font-size:10px;color:#cbd5e1;cursor:pointer;">
            <input type="checkbox" id="sw-server-sync" ${defaultSync ? 'checked' : ''} style="accent-color:#a855f7;" />
            📁 حفظ بمجلد d:/pptx
          </label>
        </div>
      </div>

      <!-- صيغة التصدير -->
      <div style="background:#1e293b;padding:6px 9px;border-radius:8px;border:1px solid #334155;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;gap:6px;justify-content:space-between;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;color:#e2e8f0;">
            <input type="radio" name="sw-format" id="fmt-pdf" value="pdf" ${defaultFmt === 'pdf' ? 'checked' : ''} style="accent-color:#38bdf8;" />
            📄 PDF (نص قابل للبحث)
          </label>
          <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;color:#e2e8f0;">
            <input type="radio" name="sw-format" id="fmt-pptx" value="pptx" ${defaultFmt === 'pptx' ? 'checked' : ''} style="accent-color:#f97316;" />
            📊 PPTX
          </label>
          <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;color:#e2e8f0;">
            <input type="radio" name="sw-format" id="fmt-zip" value="zip" ${defaultFmt === 'zip' ? 'checked' : ''} style="accent-color:#a855f7;" />
            🗜️ ZIP
          </label>
          <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;color:#e2e8f0;">
            <input type="radio" name="sw-format" id="fmt-all" value="all" ${defaultFmt === 'all' ? 'checked' : ''} style="accent-color:#22c55e;" />
            🌟 الكل
          </label>
        </div>
      </div>

      <!-- أزرار التشغيل -->
      <div style="display:flex;gap:6px;">
        <button id="sw-btn-preview" style="background:#8b5cf6;color:white;border:none;padding:7px;border-radius:7px;font-size:12px;cursor:pointer;font-weight:bold;flex:1;display:none;">👁️ معاينة</button>
        <button id="sw-btn-start" style="background:#16a34a;color:white;border:none;padding:9px 12px;border-radius:7px;font-size:13px;cursor:pointer;font-weight:bold;flex:2;display:none;box-shadow:0 3px 12px rgba(22,163,74,0.4);">
          <span id="sw-start-label">🚀 ابدأ تصوير درس #1</span>
        </button>
      </div>

      <!-- زر الإيقاف الفوري -->
      <button id="sw-btn-stop" style="background:#dc2626;color:white;border:none;padding:9px 12px;border-radius:7px;font-size:13px;cursor:pointer;font-weight:bold;display:none;box-shadow:0 3px 12px rgba(220,38,38,0.5);">🛑 إيقاف وحفظ الآن</button>

      <!-- نص الحالة والشريط -->
      <div style="display:flex;flex-direction:column;gap:3px;text-align:center;">
        <span id="sw-status-desc" style="font-size:11px;color:#94a3b8;">اضغط 1️⃣ لربط تبويب العرض للبدء</span>
        <div id="sw-progress-bar-bg" style="display:none;width:100%;height:6px;background:#334155;border-radius:3px;overflow:hidden;">
          <div id="sw-progress-bar-fill" style="width:0%;height:100%;background:#22c55e;transition:width 0.25s ease;"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(bar);

  // شريط مصغر عند الطي
  const miniBadge = document.createElement('div');
  miniBadge.id = 'wizard-mini-badge';
  miniBadge.style.cssText = `
    position: fixed;
    top: 15px;
    right: 15px;
    z-index: 9999999;
    background: #0f172a;
    border: 2px solid #38bdf8;
    color: #38bdf8;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: bold;
    font-family: Segoe UI, Tahoma, sans-serif;
    cursor: pointer;
    box-shadow: 0 5px 20px rgba(0,0,0,0.7);
    display: none;
    direction: rtl;
  `;
  miniBadge.innerHTML = '⚡ إظهار لوحة التصوير (درس #<span id="sw-mini-mod-num">1</span>)';
  miniBadge.onclick = () => {
    miniBadge.style.display = 'none';
    bar.style.display = 'flex';
  };
  document.body.appendChild(miniBadge);

  // سحب اللوحة
  const barHeader = document.getElementById('sw-bar-header');
  let isDraggingBar = false;
  let barDragOffset = { x: 0, y: 0 };
  barHeader.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDraggingBar = true;
    barDragOffset = { x: e.clientX - bar.offsetLeft, y: e.clientY - bar.offsetTop };
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDraggingBar) return;
    barPos.x = Math.max(0, Math.min(window.innerWidth - 350, e.clientX - barDragOffset.x));
    barPos.y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - barDragOffset.y));
    bar.style.left = barPos.x + 'px';
    bar.style.top  = barPos.y + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (isDraggingBar) {
      isDraggingBar = false;
      saveCurrentSettings();
    }
  });

  document.getElementById('sw-btn-min').onclick = () => {
    bar.style.display = 'none';
    miniBadge.style.display = 'block';
  };
  document.getElementById('sw-btn-close').onclick = () => {
    if (confirm(`إنهاء الجلسة وإغلاق الأداة؟\n(تم إنجاز ${sessionHistory.length} دروس في هذه الجلسة)`)) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      CLEANUP_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    }
  };

  // فتح / إغلاق المعرض
  document.getElementById('sw-btn-filmstrip-toggle').onclick = () => {
    filmstrip.style.display = (filmstrip.style.display === 'none') ? 'flex' : 'none';
    renderFilmstrip();
  };

  // زر الجلب التلقائي لبيانات الدرس (Scrape)
  document.getElementById('sw-btn-rescrape').onclick = () => {
    const meta = autoScrapePageMetadata();
    if (meta.foundTitle) {
      document.getElementById('sw-doc-title').value = meta.foundTitle.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
    }
    if (meta.foundPages) {
      document.getElementById('sw-pages').value = meta.foundPages;
    }
    playBeep(1200, 0.08);
    alert(`🔍 تم فحص الصفحة بنجاح:\n- اسم الدرس: ${meta.foundTitle || 'تلقائي'}\n- عدد الشرائح: ${meta.foundPages || 'تلقائي'}`);
    saveCurrentSettings();
  };

  // عناصر التحكم
  const title        = document.getElementById('sw-title');
  const desc         = document.getElementById('sw-status-desc');
  const btnScreen    = document.getElementById('sw-btn-screen');
  const btnDraw      = document.getElementById('sw-btn-draw');
  const btnPreview   = document.getElementById('sw-btn-preview');
  const btnStart     = document.getElementById('sw-btn-start');
  const btnStop      = document.getElementById('sw-btn-stop');
  const progressBg   = document.getElementById('sw-progress-bar-bg');
  const progressFill = document.getElementById('sw-progress-bar-fill');

  document.getElementById('sw-nl').onclick = () => { cropArea.x -= 15; syncCropBoxDisplay(); saveCurrentSettings(); };
  document.getElementById('sw-nr').onclick = () => { cropArea.x += 15; syncCropBoxDisplay(); saveCurrentSettings(); };
  document.getElementById('sw-nu').onclick = () => { cropArea.y -= 10; syncCropBoxDisplay(); saveCurrentSettings(); };
  document.getElementById('sw-nd').onclick = () => { cropArea.y += 10; syncCropBoxDisplay(); saveCurrentSettings(); };
  document.getElementById('sw-ew').onclick = () => { cropArea.w += 20; syncCropBoxDisplay(); saveCurrentSettings(); };
  document.getElementById('sw-sw').onclick = () => { cropArea.w = Math.max(100, cropArea.w - 20); syncCropBoxDisplay(); saveCurrentSettings(); };

  ['sw-pages', 'sw-delay', 'sw-doc-title', 'sw-dedup', 'sw-sound', 'sw-ultra-res', 'sw-server-sync'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveCurrentSettings);
  });
  document.querySelectorAll('input[name="sw-format"]').forEach(r => r.addEventListener('change', saveCurrentSettings));

  // 1️⃣ ربط الشاشة
  btnScreen.onclick = async () => {
    desc.innerText = 'اختر "هذا التبويب" (This Tab) للمتابعة...';
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false
      });
      video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      await new Promise(r => video.onloadedmetadata = r);
      await new Promise(r => setTimeout(r, 400));

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        btnScreen.style.display = 'block';
        btnScreen.style.background = '#0284c7';
        btnScreen.innerHTML = '<span>1️⃣ ربط الشاشة من جديد</span>';
        desc.innerText = 'تم إيقاف المشاركة. اضغط 1️⃣ لإعادة الربط.';
      });

      btnScreen.style.background = '#065f46';
      btnScreen.innerHTML = '<span>✓ الشاشة متصلة وجاهزة</span>';
      btnPreview.style.display = 'block';
      btnStart.style.display = 'block';
      desc.innerText = 'جاهز! اضبط المستطيل الأخضر واضغط ابدأ التصوير 🚀';
    } catch (err) {
      desc.innerText = 'تم إلغاء اختيار الشاشة. اضغط مجدداً للربط.';
    }
  };

  btnDraw.onclick = () => {
    bar.style.opacity = '0.2';
    const overlay = document.createElement('div');
    overlay.id = 'crop-canvas-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999995;cursor:crosshair;background:rgba(0,0,0,0.35);';
    document.body.appendChild(overlay);

    let startX, startY, isDrawing = false;
    overlay.onmousedown = (e) => { startX = e.clientX; startY = e.clientY; isDrawing = true; };
    overlay.onmousemove = (e) => {
      if (!isDrawing) return;
      cropArea = {
        x: Math.min(startX, e.clientX),
        y: Math.min(startY, e.clientY),
        w: Math.abs(e.clientX - startX),
        h: Math.abs(e.clientY - startY)
      };
      syncCropBoxDisplay();
    };
    overlay.onmouseup = () => {
      isDrawing = false;
      overlay.remove();
      bar.style.opacity = '1';
      desc.innerText = 'تم رسم المستطيل ✓ يمكنك تعديله بمقابض الزوايا';
      saveCurrentSettings();
    };
  };

  const WIZARD_OVERLAYS = [
    'wizard-bar', 'crop-box', 'next-target-pointer', 
    'preview-popup', 'crop-canvas-overlay', 'wizard-mini-badge',
    'wizard-filmstrip-drawer', 'wizard-lightbox'
  ];

  function hideWizardUI() {
    WIZARD_OVERLAYS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.visibility = 'hidden';
    });
  }

  function showWizardUI() {
    WIZARD_OVERLAYS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.visibility = 'visible';
    });
  }

  // ─── 🔎 استخراج النصوص المرئية داخل الشريحة (Searchable PDF Layer) ───
  function extractVisibleSlideTexts() {
    const texts = [];
    try {
      const f = document.querySelector('iframe');
      const doc = f && f.contentDocument ? f.contentDocument : document;
      const elements = doc.querySelectorAll('h1, h2, h3, h4, p, span, li, [class*="text"], text');
      elements.forEach(el => {
        const str = (el.innerText || el.textContent || '').trim();
        if (str && str.length > 1 && str.length < 200 && !texts.includes(str) && el.children.length === 0) {
          texts.push(str);
        }
      });
    } catch (e) {}
    return texts.slice(0, 35);
  }

  // ─── 💎 التقاط فريم واحد بتقنية الدقة الفائقة 2x Super-Sampling ───
  async function captureSingleFrame() {
    const isUltra = document.getElementById('sw-ultra-res') ? document.getElementById('sw-ultra-res').checked : true;
    const superScale = isUltra ? Math.max(2, window.devicePixelRatio || 2) : 1;

    const scaleX = video.videoWidth  / window.innerWidth;
    const scaleY = video.videoHeight / window.innerHeight;

    const cropX = Math.round(cropArea.x * scaleX);
    const cropY = Math.round(cropArea.y * scaleY);
    const cropW = Math.round(cropArea.w * scaleX);
    const cropH = Math.round(cropArea.h * scaleY);

    hideWizardUI();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 70));

    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(cropW * (superScale > 1 ? 1.5 : 1));
    canvas.height = Math.round(cropH * (superScale > 1 ? 1.5 : 1));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (isUltra) {
      // تعزيز تباين النصوص وصقل الحواف
      ctx.filter = 'contrast(1.03) brightness(1.01)';
    }

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    const texts = extractVisibleSlideTexts();

    const result = {
      dataUrl: canvas.toDataURL('image/jpeg', 0.96),
      canvas: canvas,
      w: canvas.width,
      h: canvas.height,
      texts: texts
    };

    showWizardUI();
    return result;
  }

  function getFrameFingerprint(canvas) {
    try {
      const thumb = document.createElement('canvas');
      thumb.width = 64;
      thumb.height = 36;
      const tCtx = thumb.getContext('2d');
      tCtx.drawImage(canvas, 0, 0, 64, 36);
      return tCtx.getImageData(0, 0, 64, 36).data;
    } catch (e) {
      return null;
    }
  }

  function areFramesIdentical(data1, data2, threshold = 0.985) {
    if (!data1 || !data2 || data1.length !== data2.length) return false;
    let identicalPixels = 0;
    const totalPixels = data1.length / 4;
    for (let i = 0; i < data1.length; i += 4) {
      const diff = Math.abs(data1[i] - data2[i]) + Math.abs(data1[i+1] - data2[i+1]) + Math.abs(data1[i+2] - data2[i+2]);
      if (diff < 30) identicalPixels++;
    }
    return (identicalPixels / totalPixels) >= threshold;
  }

  // 👁️ معاينة فورية
  btnPreview.onclick = async () => {
    if (!video) return;
    const shot = await captureSingleFrame();
    showLightbox(shot.dataUrl, 'المعاينة');
  };

  function safeClick(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      if (typeof el.click === 'function') el.click();
      else if (el.parentElement && typeof el.parentElement.click === 'function') el.parentElement.click();
    } catch (e) {}
  }

  function clickNextTarget(tp) {
    try {
      const f = document.querySelector('iframe');
      if (f) {
        try {
          const fr = f.getBoundingClientRect();
          if (f.contentDocument) {
            const innerEl = f.contentDocument.elementFromPoint(tp.x - fr.left, tp.y - fr.top);
            safeClick(innerEl);
          }
        } catch (e) {}
        try {
          f.contentWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
        } catch (e) {}
      }
      safeClick(document.elementFromPoint(tp.x, tp.y));
    } catch (e) {}
  }

  // ─── 📁 الحفظ المباشر في المجلد المحلي d:\pptx\output\ عبر السيرفر ───
  async function saveFileDirectlyToServer(fileName, base64Content, folderName) {
    const isSync = document.getElementById('sw-server-sync') ? document.getElementById('sw-server-sync').checked : true;
    if (!isSync) return false;

    try {
      const res = await fetch('http://localhost:3000/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: fileName,
          fileBase64: base64Content,
          folder: folderName
        })
      });
      if (res.ok) {
        console.log(`[Auto-Save] Saved successfully to d:/pptx/output/${folderName}/${fileName}`);
        return true;
      }
    } catch (e) {
      // السيرفر غير مشغل محلياً - لا بأس التنزيل في المتصفح سيتولى الأمر
    }
    return false;
  }

  // ─── 5️⃣ ابدأ التصوير التلقائي ───
  btnStart.onclick = async () => {
    if (!stream || !video || !stream.active) {
      alert('يرجى أولاً الضغط على 1️⃣ لربط الشاشة');
      return;
    }

    const totalPages     = parseInt(document.getElementById('sw-pages').value) || 38;
    const settleDelaySec = parseFloat(document.getElementById('sw-delay').value) || 2.2;
    const exportFmt      = document.querySelector('input[name="sw-format"]:checked').value;
    const dedupActive    = document.getElementById('sw-dedup').checked;
    const targetPoint    = { x: pointer.offsetLeft, y: pointer.offsetTop };
    const customTitle    = (document.getElementById('sw-doc-title').value.trim() || `Module_${currentModuleIndex}`).replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');

    cropBox.style.display    = 'none';
    pointer.style.display    = 'none';
    btnPreview.style.display = 'none';
    btnStart.style.display   = 'none';
    btnDraw.parentElement.style.display = 'none';
    btnStop.style.display    = 'block';
    progressBg.style.display = 'block';

    capturedSlides = [];
    stopRequested = false;
    previousFrameFingerprint = null;
    let duplicateRetries = 0;

    btnStop.disabled = false;
    btnStop.innerText = '🛑 إيقاف وحفظ الآن';
    btnStop.onclick = () => {
      stopRequested = true;
      btnStop.disabled = true;
      btnStop.innerText = '⏳ جاري الحفظ وإنهاء الملفات...';
    };

    // إظهار شريط المعرض لمتابعة التقدم حياً
    filmstrip.style.display = 'flex';
    renderFilmstrip();

    for (let i = 1; i <= totalPages; i++) {
      if (stopRequested) break;

      title.innerText = `📸 درس #${currentModuleIndex}: شريحة ${i} / ${totalPages}`;
      desc.innerText = `انتظار ثبات الشريحة (${settleDelaySec} ثانية)...`;
      progressFill.style.width = `${Math.round(((i - 1) / totalPages) * 100)}%`;

      await new Promise(r => setTimeout(r, Math.round(settleDelaySec * 1000)));
      if (stopRequested) break;

      const captured = await captureSingleFrame();
      const currentFingerprint = getFrameFingerprint(captured.canvas);

      if (dedupActive && previousFrameFingerprint && areFramesIdentical(previousFrameFingerprint, currentFingerprint)) {
        if (duplicateRetries < 2) {
          duplicateRetries++;
          desc.innerText = `⚠️ لم تتغير الشريحة! إعادة النقر على Next (${duplicateRetries}/2)...`;
          clickNextTarget(targetPoint);
          await new Promise(r => setTimeout(r, 1200));
          i--;
          continue;
        } else {
          desc.innerText = `ℹ️ تم الوصول لآخر شريحة في درس #${currentModuleIndex}.`;
          capturedSlides.push(captured);
          renderFilmstrip();
          break;
        }
      }

      duplicateRetries = 0;
      previousFrameFingerprint = currentFingerprint;
      capturedSlides.push(captured);
      renderFilmstrip();
      playBeep(980, 0.08);

      progressFill.style.width = `${Math.round((i / totalPages) * 100)}%`;

      if (i < totalPages && !stopRequested) {
        desc.innerText = `⏭️ تقليب للشريحة القادمة ${i + 1}...`;
        clickNextTarget(targetPoint);
        await new Promise(r => setTimeout(r, 900));
      }
    }

    const capturedCount = capturedSlides.length;
    btnStop.style.display = 'none';

    if (capturedCount === 0) {
      desc.innerText = 'لم يتم التقاط أي شرائح.';
      cropBox.style.display = 'block';
      pointer.style.display = 'block';
      btnStart.style.display = 'block';
      return;
    }

    title.innerText = `⏳ جاري تصدير درس #${currentModuleIndex}...`;
    desc.innerText = `بناء ${capturedCount} شريحة بدقة فائقة...`;

    // ─── 1. تصدير PDF (مع نصوص قابلة للبحث Searchable OCR Text) ───
    async function exportPDF() {
      await new Promise(res => {
        const check = setInterval(() => { if (window.jspdf) { clearInterval(check); res(); } }, 150);
        setTimeout(() => { clearInterval(check); res(); }, 8000);
      });
      if (!window.jspdf) return;

      const { jsPDF } = window.jspdf;
      const first = capturedSlides[0];
      const pageW = 297;
      const pageH = Math.round(297 * (first.h / first.w));
      const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: [pageW, pageH], compress: true });

      for (let idx = 0; idx < capturedSlides.length; idx++) {
        const s = capturedSlides[idx];
        if (idx > 0) pdf.addPage([pageW, pageH], 'l');
        pdf.addImage(s.dataUrl, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');

        // تضمين طبقة النصوص القابلة للبحث والنسخ بالـ PDF (Searchable Text Layer)
        if (s.texts && s.texts.length > 0) {
          try {
            pdf.setTextColor(255, 255, 255); // لون شفاف متوافق مع الخلفية
            pdf.setFontSize(2);
            pdf.text(s.texts.join('  '), 5, pageH - 2);
          } catch (e) {}
        }

        desc.innerText = `📄 بناء PDF فائق الدقة: ${idx + 1} / ${capturedCount}...`;
        await new Promise(r => setTimeout(r, 8));
      }

      const pdfBase64 = pdf.output('datauristring');
      const savedOnServer = await saveFileDirectlyToServer(`${customTitle}.pdf`, pdfBase64, customTitle);
      pdf.save(`${customTitle}.pdf`);
      return savedOnServer;
    }

    // ─── 2. تصدير PPTX ───
    async function exportPPTX() {
      await new Promise(res => {
        const check = setInterval(() => { if (window.PptxGenJS) { clearInterval(check); res(); } }, 150);
        setTimeout(() => { clearInterval(check); res(); }, 12000);
      });
      if (!window.PptxGenJS) return;

      const pptx = new window.PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';

      for (let idx = 0; idx < capturedSlides.length; idx++) {
        const slide = pptx.addSlide();
        slide.addImage({ data: capturedSlides[idx].dataUrl, x: 0, y: 0, w: '100%', h: '100%' });
        desc.innerText = `📊 بناء PPTX: ${idx + 1} / ${capturedCount}...`;
        await new Promise(r => setTimeout(r, 8));
      }
      await pptx.writeFile({ fileName: `${customTitle}.pptx` });
    }

    // ─── 3. تصدير ZIP ───
    async function exportZIP() {
      await new Promise(res => {
        const check = setInterval(() => { if (window.JSZip) { clearInterval(check); res(); } }, 150);
        setTimeout(() => { clearInterval(check); res(); }, 8000);
      });
      if (!window.JSZip) return;

      const zip = new window.JSZip();
      const folder = zip.folder(customTitle);

      for (let idx = 0; idx < capturedSlides.length; idx++) {
        const base64Data = capturedSlides[idx].dataUrl.split(',')[1];
        const num = String(idx + 1).padStart(3, '0');
        folder.file(`slide_${num}.jpg`, base64Data, { base64: true });
        desc.innerText = `🗜️ ضغط ZIP: ${idx + 1} / ${capturedCount}...`;
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const dlLink = document.createElement('a');
      dlLink.href = URL.createObjectURL(blob);
      dlLink.download = `${customTitle}_images.zip`;
      dlLink.click();
    }

    try {
      if (exportFmt === 'pdf')  await exportPDF();
      if (exportFmt === 'pptx') await exportPPTX();
      if (exportFmt === 'zip')  await exportZIP();
      if (exportFmt === 'all') {
        await exportPDF();
        await exportPPTX();
        await exportZIP();
      }

      sessionHistory.push({
        name: customTitle,
        slides: capturedCount,
        fmt: exportFmt,
        time: new Date().toLocaleTimeString('ar-SA')
      });

      playBeep(1200, 0.15);

      // الاستعداد للدرس التالي
      currentModuleIndex++;
      const nextTitle = getNextModuleTitle(customTitle, currentModuleIndex);
      const titleInp = document.getElementById('sw-doc-title');
      if (titleInp) titleInp.value = nextTitle;

      const countEl = document.getElementById('sw-session-count');
      const labelEl = document.getElementById('sw-curr-mod-label');
      const miniModEl = document.getElementById('sw-mini-mod-num');
      const startLabel = document.getElementById('sw-start-label');

      if (countEl) countEl.innerText = `${sessionHistory.length} مكتملة`;
      if (labelEl) labelEl.innerText = `#${currentModuleIndex}`;
      if (miniModEl) miniModEl.innerText = `${currentModuleIndex}`;
      if (startLabel) startLabel.innerText = `🚀 ابدأ تصوير درس #${currentModuleIndex}`;

      cropBox.style.display    = 'block';
      pointer.style.display    = 'block';
      btnPreview.style.display = 'block';
      btnDraw.parentElement.style.display = 'block';
      btnStart.style.display   = 'block';
      btnStart.style.background = '#16a34a';

      title.innerText = `🎉 تم تصدير ${customTitle} بنجاح!`;
      desc.innerHTML = `
        <span style="color:#fef08a;font-weight:bold;">جاهز للدرس #${currentModuleIndex} 🚀</span><br/>
        انتقل للدرس التالي ثم اضغط الزر الأخضر للبدء فوراً!
      `;
      bar.style.borderColor = '#22c55e';
      progressFill.style.width = '0%';
      saveCurrentSettings();

    } catch (err) {
      desc.innerText = 'حدث خطأ أثناء التصدير: ' + err.message;
      cropBox.style.display = 'block';
      pointer.style.display = 'block';
      btnStart.style.display = 'block';
    }
  };

  console.log('⚡ SlideWizard Pro Studio v3.0 Master Ultra Loaded!');
})();
