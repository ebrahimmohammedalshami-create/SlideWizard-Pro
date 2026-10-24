document.addEventListener('DOMContentLoaded', () => {
  const btnLaunch = document.getElementById('btn-launch');

  btnLaunch.addEventListener('click', async () => {
    btnLaunch.disabled = true;
    btnLaunch.style.opacity = '0.7';
    btnLaunch.innerHTML = '<span>⏳ جاري تشغيل اللوحة...</span>';

    try {
      await chrome.runtime.sendMessage({ action: 'LAUNCH_WIZARD' });
      // إغلاق نافذة الـ Popup بعد ثانية لتركيز الشاشة على صفحة العرض
      setTimeout(() => {
        window.close();
      }, 300);
    } catch (err) {
      console.error(err);
      btnLaunch.disabled = false;
      btnLaunch.style.opacity = '1';
      btnLaunch.innerHTML = '<span>❌ تعذر التشغيل. أعد المحاولة</span>';
    }
  });
});
