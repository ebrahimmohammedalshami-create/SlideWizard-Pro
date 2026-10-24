/**
 * =====================================================
 *  SlideSnap Auto-Capture Console Script
 *  ينسخ تلقائياً جميع شرائح العرض ويصدرها PDF
 * =====================================================
 *  طريقة الاستخدام:
 *  1. افتح العرض التقديمي في المتصفح (Chrome / Edge)
 *  2. اضغط F12 لفتح أدوات المطور
 *  3. اذهب إلى تبويب "Console"
 *  4. انسخ والصق هذا الكود كاملاً واضغط Enter
 *  5. انتظر حتى ينتهي ويُنزّل الـ PDF تلقائياً
 * =====================================================
 */
(async function SlideSnapAutoCapture() {

  // ── الإعدادات ────────────────────────────────────────
  const DELAY_BETWEEN_SLIDES_MS = 2500;   // وقت الانتظار بين الشرائح (مللي ثانية)
  const PDF_FILENAME             = 'payShield_10K_Module01.pdf';
  const JPEG_QUALITY             = 0.95;
  // ─────────────────────────────────────────────────────

  // ── مساعد للتسجيل في الكونسول ────────────────────────
  const log = (msg, type = 'log') => {
    const styles = {
      log:     'background:#0f172a;color:#38bdf8;padding:3px 8px;border-radius:4px;font-weight:bold',
      success: 'background:#064e3b;color:#34d399;padding:3px 8px;border-radius:4px;font-weight:bold',
      warn:    'background:#451a03;color:#fbbf24;padding:3px 8px;border-radius:4px;font-weight:bold',
      error:   'background:#450a0a;color:#f87171;padding:3px 8px;border-radius:4px;font-weight:bold',
    };
    console.log('%c SlideSnap %c ' + msg, styles[type] || styles.log, '');
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ── 1. تحميل مكتبة html2canvas ───────────────────────
  log('جاري تحميل مكتبة html2canvas...');
  if (!window.html2canvas) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('فشل تحميل html2canvas'));
      document.head.appendChild(s);
    });
  }
  log('✓ html2canvas جاهزة', 'success');

  // ── 2. تحميل مكتبة jsPDF ─────────────────────────────
  log('جاري تحميل مكتبة jsPDF...');
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('فشل تحميل jsPDF'));
      document.head.appendChild(s);
    });
  }
  log('✓ jsPDF جاهزة', 'success');

  // ── 3. اكتشاف عنصر الشريحة ──────────────────────────
  // يحاول إيجاد الـ iframe الذي يحتوي على محتوى SCORM أو أي iframe رئيسي
  let slideElement = null;
  let slideFrame   = null;

  // محاولة إيجاد iframe الـ SCORM
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const f of iframes) {
    try {
      // إذا كان نفس النطاق وله محتوى
      if (f.contentDocument && f.contentDocument.body) {
        const fw = f.offsetWidth;
        const fh = f.offsetHeight;
        if (fw > 400 && fh > 300) {
          slideFrame   = f;
          slideElement = f;
          log(`وجدنا iframe الشريحة: ${fw}×${fh} بكسل`, 'success');
          break;
        }
      }
    } catch(e) { /* cross-origin */ }
  }

  // إذا لم يوجد iframe، نحاول إيجاد الـ div الرئيسي للشريحة
  if (!slideElement) {
    const selectors = [
      '#scorm_object',
      '#scorm-frame',
      '.scorm-content',
      '[id*="scorm"]',
      '[id*="slide"]',
      '[class*="slide"]',
      '[class*="content-frame"]',
      'iframe',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetWidth > 300 && el.offsetHeight > 200) {
        slideElement = el;
        log(`وجدنا عنصر الشريحة: ${sel} (${el.offsetWidth}×${el.offsetHeight})`, 'success');
        break;
      }
    }
  }

  // إذا ما زلنا لم نجد شيئاً — نستخدم منطقة ثابتة من الصفحة الرئيسية
  if (!slideElement) {
    log('لم يُعثر على iframe — سيتم التقاط منطقة الشريحة من الصفحة مباشرة', 'warn');
    // نبحث عن العنصر الأكبر في الصفحة
    slideElement = document.body;
  }

  // ── 4. إيجاد زر NEXT ─────────────────────────────────
  function findNextButton() {
    const candidates = [
      ...document.querySelectorAll('button, a, [role="button"]'),
      ...document.querySelectorAll('[class*="next"], [id*="next"]'),
    ];
    for (const el of candidates) {
      const txt = (el.textContent || el.value || el.getAttribute('aria-label') || '').toUpperCase().trim();
      if (txt === 'NEXT' || txt === 'التالي' || txt.includes('NEXT') || txt.includes('FORWARD')) {
        if (!el.disabled && el.offsetParent !== null) return el;
      }
    }
    return null;
  }

  // ── 5. إيجاد عدد الشرائح الكلي ──────────────────────
  function parseTotalSlides() {
    const allText = document.body.innerText;
    const match   = allText.match(/(\d+)\s+of\s+(\d+)/i) || allText.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) return { current: parseInt(match[1]), total: parseInt(match[2]) };
    return { current: 1, total: 40 }; // قيمة افتراضية
  }

  const { total } = parseTotalSlides();
  log(`إجمالي الشرائح المكتشفة: ${total} شريحة`);

  // ── 6. إعداد حجم الشاشة للالتقاط ────────────────────
  // حساب الإحداثيات الدقيقة لمنطقة الشريحة
  function getSlideRect() {
    if (slideElement && slideElement !== document.body) {
      const r = slideElement.getBoundingClientRect();
      return {
        x: Math.max(0, Math.round(r.left)),
        y: Math.max(0, Math.round(r.top  + window.scrollY)),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }
    // احتياطي: منطقة ثابتة تشمل عموماً الشريحة بناءً على الصفحة الحالية
    return { x: 55, y: 88, w: 745, h: 450 };
  }

  // ── 7. دالة الالتقاط ─────────────────────────────────
  const capturedImages = [];

  async function captureCurrentSlide(index) {
    log(`📸 التقاط الشريحة ${index} / ${total}...`);

    try {
      let imgDataUrl;

      if (slideFrame && slideFrame.contentDocument) {
        // التقاط الـ iframe مباشرة (نفس النطاق)
        const canvas = await html2canvas(slideFrame.contentDocument.body, {
          useCORS: true,
          allowTaint: true,
          scale: 2,   // دقة مضاعفة
          logging: false,
          backgroundColor: '#ffffff',
        });
        imgDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      } else {
        // التقاط منطقة من الصفحة الرئيسية
        const rect   = getSlideRect();
        const canvas = await html2canvas(document.body, {
          useCORS: true,
          allowTaint: true,
          scale: 2,
          logging: false,
          x: rect.x,
          y: rect.y,
          width:  rect.w,
          height: rect.h,
          windowWidth:  window.innerWidth,
          windowHeight: window.innerHeight,
          scrollX: -window.scrollX,
          scrollY: -window.scrollY,
          backgroundColor: '#ffffff',
        });
        imgDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      }

      capturedImages.push({ index, dataUrl: imgDataUrl });
      log(`✓ تم التقاط الشريحة ${index}`, 'success');
      return true;
    } catch (err) {
      log(`✗ فشل التقاط الشريحة ${index}: ${err.message}`, 'error');
      return false;
    }
  }

  // ── 8. حلقة التقاط جميع الشرائح ─────────────────────
  log(`🚀 بدء التقاط ${total} شريحة تلقائياً...`);
  log(`⏱️ الوقت المتوقع: ~${Math.ceil(total * DELAY_BETWEEN_SLIDES_MS / 1000)} ثانية`);

  // التقاط الشريحة الأولى
  await sleep(1000); // انتظار تحميل الصفحة
  await captureCurrentSlide(1);

  // التنقل عبر بقية الشرائح
  for (let i = 2; i <= total; i++) {
    // إيجاد زر NEXT والضغط عليه
    const nextBtn = findNextButton();
    if (!nextBtn) {
      log(`لم يُعثر على زر NEXT في الشريحة ${i-1} — التوقف`, 'warn');
      break;
    }

    nextBtn.click();
    log(`⏭️ الانتقال إلى الشريحة ${i}...`);

    // انتظار تحميل الشريحة الجديدة
    await sleep(DELAY_BETWEEN_SLIDES_MS);

    await captureCurrentSlide(i);
  }

  // ── 9. توليد ملف PDF ──────────────────────────────────
  log(`✅ تم التقاط ${capturedImages.length} شريحة — جاري توليد PDF...`);

  if (capturedImages.length === 0) {
    log('لا توجد شرائح لتصديرها!', 'error');
    return;
  }

  // ترتيب الشرائح
  capturedImages.sort((a, b) => a.index - b.index);

  // إنشاء مؤقت للصورة لمعرفة الأبعاد
  const getImgDimensions = (dataUrl) => new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });

  const { jsPDF } = window.jspdf;
  const firstDim  = await getImgDimensions(capturedImages[0].dataUrl);
  const isLandscape = firstDim.w >= firstDim.h;

  const mmW = isLandscape ? 297 : 210;
  const mmH = isLandscape ? (297 * firstDim.h / firstDim.w) : (210 * firstDim.h / firstDim.w);

  const pdf = new jsPDF({
    orientation: isLandscape ? 'l' : 'p',
    unit: 'mm',
    format: [mmW, mmH],
    compress: true,
  });

  for (let i = 0; i < capturedImages.length; i++) {
    if (i > 0) pdf.addPage([mmW, mmH], isLandscape ? 'l' : 'p');
    pdf.addImage(capturedImages[i].dataUrl, 'JPEG', 0, 0, mmW, mmH, undefined, 'FAST');
    log(`📄 إضافة الشريحة ${capturedImages[i].index} إلى PDF...`);
  }

  // ── 10. حفظ الملف ─────────────────────────────────────
  pdf.save(PDF_FILENAME);
  log(`🎉 تم حفظ ${capturedImages.length} شريحة في ملف: ${PDF_FILENAME}`, 'success');
  log('تفقد مجلد التنزيلات (Downloads) على جهازك 📁', 'success');

})();
