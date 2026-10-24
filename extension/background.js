/**
 * Background Service Worker for SlideWizard Pro
 */

// استماع لاختصار لوحة المفاتيح (Alt + S)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle_wizard') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      injectOrToggleWizard(tab.id);
    }
  }
});

// استماع للرسائل من popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'LAUNCH_WIZARD') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab && tab.id) {
        injectOrToggleWizard(tab.id);
        sendResponse({ success: true });
      }
    });
    return true; // Keep message channel open for async response
  }
});

// حقن السكربت أو تفعيله في التبويب النشط
async function injectOrToggleWizard(tabId) {
  try {
    // محاولة إرسال رسالة تبديل أولاً إذا كان السكربت محقوناً بالفعل
    await chrome.tabs.sendMessage(tabId, { action: 'TOGGLE_WIZARD' });
  } catch (err) {
    // إذا لم يكن السكربت محقوناً بعد، نقوم بحقنه وملفاته المحلية
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [
          'libs/jspdf.umd.min.js',
          'libs/jszip.min.js',
          'libs/pptxgen.bundle.js',
          'content_script.js'
        ]
      });
    } catch (e) {
      console.error('Failed to inject SlideWizard script:', e);
    }
  }
}
