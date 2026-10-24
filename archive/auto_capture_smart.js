(async function SlideSnapAutoCapturePro() {
  // 1. تحميل مكتبة PDF
  if (!window.jspdf) {
    await new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res;
      document.head.appendChild(s);
    });
  }

  // إزالة أي لوحة سابقة
  const old = document.getElementById('slide-snap-overlay-container');
  if (old) old.remove();

  // حساب مكان الشريحة التقريبي تلقائياً (استبعاد القائمة الجانبية)
  const iframe = document.querySelector('iframe');
  let defaultRect;
  if (iframe) {
    const ir = iframe.getBoundingClientRect();
    // الشريحة تأخذ الجزء الأيسر وتستبعد القائمة اليمنى (حوالي 260 بكسل)
    defaultRect = {
      x: Math.round(ir.left),
      y: Math.round(ir.top),
      w: Math.round(ir.width - 260),
      h: Math.round(ir.height)
    };
  } else {
    defaultRect = { x: 50, y: 70, w: 900, h: 560 };
  }

  let selectedRect = { ...defaultRect };

  // إنشاء واجهة التحكم العائمة
  const container = document.createElement('div');
  container.id = 'slide-snap-overlay-container';
  container.style.cssText = 'position:fixed;top:15px;left:50%;transform:translateX(-50%);z-index:9999999;background:rgba(15,23,42,0.95);border:2px solid #38bdf8;padding:12px 24px;border-radius:14px;box-shadow:0 15px 35px rgba(0,0,0,0.8);font-family:Segoe UI,Tahoma,sans-serif;color:white;direction:rtl;display:flex;align-items:center;gap:15px;backdrop-filter:blur(8px);';

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:3px;">
      <span style="font-weight:bold;color:#38bdf8;font-size:15px;" id="snap-title">📸 SlideSnap: تصوير العرض فقط</span>
      <span style="font-size:12px;color:#94a3b8;" id="snap-desc">المربع الأخضر يحدد مكان التصوير بدقة.</span>
    </div>
    <button id="btn-draw" style="background:#334155;color:#e2e8f0;border:1px solid #475569;padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;">✏️ تحديد بالماوس</button>
    <button id="btn-start" style="background:#0284c7;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;box-shadow:0 4px 12px rgba(2,132,199,0.4);">🚀 ابدأ التقليب والتصوير الآلي</button>
  `;
  document.body.appendChild(container);

  // إطار المعاينة الأخضر الشفاف
  const highlightBox = document.createElement('div');
  highlightBox.id = 'slide-highlight-box';
  highlightBox.style.cssText = `position:fixed;border:3px dashed #22c55e;background:rgba(34,197,94,0.08);z-index:9999990;pointer-events:none;left:${selectedRect.x}px;top:${selectedRect.y}px;width:${selectedRect.w}px;height:${selectedRect.h}px;border-radius:6px;transition:all 0.1s ease;`;
  
  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;top:5px;left:5px;background:#22c55e;color:#000;font-weight:bold;font-size:11px;padding:2px 8px;border-radius:4px;font-family:sans-serif;';
  label.innerText = 'مكان العرض المستهدف';
  highlightBox.appendChild(label);
  document.body.appendChild(highlightBox);

  function updateHighlight() {
    highlightBox.style.left = selectedRect.x + 'px';
    highlightBox.style.top = selectedRect.y + 'px';
    highlightBox.style.width = selectedRect.w + 'px';
    highlightBox.style.height = selectedRect.h + 'px';
  }

  // رسم التحديد يدوياً بالماوس
  const btnDraw = document.getElementById('btn-draw');
  btnDraw.onclick = () => {
    container.style.opacity = '0.3';
    const drawOverlay = document.createElement('div');
    drawOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999995;cursor:crosshair;background:rgba(0,0,0,0.2);';
    document.body.appendChild(drawOverlay);

    let startX, startY;
    let isDrawing = false;

    drawOverlay.onmousedown = (e) => {
      startX = e.clientX;
      startY = e.clientY;
      isDrawing = true;
    };

    drawOverlay.onmousemove = (e) => {
      if (!isDrawing) return;
      const currentX = e.clientX;
      const currentY = e.clientY;
      selectedRect = {
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        w: Math.abs(currentX - startX),
        h: Math.abs(currentY - startY)
      };
      updateHighlight();
    };

    drawOverlay.onmouseup = () => {
      isDrawing = false;
      drawOverlay.remove();
      container.style.opacity = '1';
    };
  };

  // العثور على زر NEXT
  function findNextBtn() {
    const candidates = [...document.querySelectorAll('button, a, [role="button"], [class*="next"]')];
    for (const el of candidates) {
      const t = (el.textContent || el.value || '').toUpperCase().trim();
      if ((t === 'NEXT' || t.includes('NEXT')) && !el.disabled && el.offsetParent !== null) return el;
    }
    return null;
  }

  // قراءة عدد الشرائح الكلي
  const totalMatch = document.body.innerText.match(/(\d+)\s+of\s+(\d+)/i);
  const totalSlides = totalMatch ? parseInt(totalMatch[2]) : 40;

  // بدء العمل
  const btnStart = document.getElementById('btn-start');
  btnStart.onclick = async () => {
    btnDraw.style.display = 'none';
    btnStart.style.display = 'none';
    const title = document.getElementById('snap-title');
    const desc = document.getElementById('snap-desc');

    title.innerText = 'يرجى اختيار "هذا التبويب" (This Tab)...';
    desc.innerText = 'اختر التبويب الحالي واضغط مشاركة (Share)';

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false
      });
    } catch (err) {
      title.innerText = 'تم إلغاء المشاركة';
      btnStart.style.display = 'inline-block';
      return;
    }

    // إخفاء إطار المعاينة الأخضر أثناء التصوير حتى لا يظهر في الصورة
    highlightBox.style.display = 'none';

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    await new Promise(r => video.onloadedmetadata = r);
    await new Promise(r => setTimeout(r, 600));

    // حساب إحداثيات القص بدقة وفق دقة الشاشة
    const scaleX = video.videoWidth / window.innerWidth;
    const scaleY = video.videoHeight / window.innerHeight;

    const cropX = Math.round(selectedRect.x * scaleX);
    const cropY = Math.round(selectedRect.y * scaleY);
    const cropW = Math.round(selectedRect.w * scaleX);
    const cropH = Math.round(selectedRect.h * scaleY);

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');

    const slidesImages = [];

    // تقليب وتصوير كل الشرائح
    for (let i = 1; i <= totalSlides; i++) {
      title.innerText = `📸 تصوير شريحة ${i} من ${totalSlides}...`;
      desc.innerText = 'جاري الانتظار واستقرار الشريحة...';

      await new Promise(r => setTimeout(r, 2200));

      // التقاط منطقة العرض فقط بدقة أصلية
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      slidesImages.push(canvas.toDataURL('image/jpeg', 0.95));

      // التقليب التلقائي
      if (i < totalSlides) {
        const nextBtn = findNextBtn();
        if (nextBtn) {
          nextBtn.click();
          desc.innerText = `⏭️ الانتقال للشريحة ${i + 1}...`;
          await new Promise(r => setTimeout(r, 800));
        } else {
          break;
        }
      }
    }

    // إنهاء البث
    stream.getTracks().forEach(t => t.stop());

    // تجميع الـ PDF
    title.innerText = '⏳ جاري إنشاء ملف PDF...';
    desc.innerText = 'لحظات ويتم الحفظ في جهازك...';

    const { jsPDF } = window.jspdf;
    const isLandscape = cropW >= cropH;
    const pageW = 297;
    const pageH = Math.round(297 * (cropH / cropW));

    const pdf = new jsPDF({
      orientation: isLandscape ? 'l' : 'p',
      unit: 'mm',
      format: [pageW, pageH],
      compress: true
    });

    for (let idx = 0; idx < slidesImages.length; idx++) {
      if (idx > 0) pdf.addPage([pageW, pageH], isLandscape ? 'l' : 'p');
      pdf.addImage(slidesImages[idx], 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
    }

    pdf.save('payShield_10K_Module01_SlidesOnly.pdf');

    title.innerText = `🎉 تم بنجاح! تم حفظ ${slidesImages.length} شريحة.`;
    desc.innerText = 'الملف نزل في مجلد التنزيلات (Downloads) يحتوي على مكان العرض فقط وبأعلى دقة.';
    container.style.borderColor = '#22c55e';
  };
})();
