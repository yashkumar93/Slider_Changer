const NATIVE_HOST = 'com.slides_phone_remote';
const SERVER_URL = 'http://127.0.0.1:8765/api/status';

async function checkServer() {
  try {
    const response = await fetch(SERVER_URL, { cache: 'no-store' });
    const data = await response.json();
    const connected = data.running === true;
    await chrome.storage.local.set({ connected, server: data });
    return connected;
  } catch (error) {
    await chrome.storage.local.set({ connected: false, server: null });
    return false;
  }
}

function startServer() {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      { action: 'start' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Slides Remote] Native host error:', chrome.runtime.lastError.message);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: 'No response from native host' });
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'start-server') {
    startServer().then(async (result) => {
      await checkServer();
      sendResponse(result);
    });
    return true;
  }

  if (message?.type === 'status') {
    checkServer().then((running) => sendResponse({ running }));
    return true;
  }
});

// Keep the extension status fresh. The server itself remains independent of the
// service worker, so it does not stop when Chrome puts the extension to sleep.
chrome.alarms.create('status', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => checkServer());

checkServer();
