const statusLedEl = document.getElementById('statusLed');
const statusTextEl = document.getElementById('statusText');
const addressRowEl = document.getElementById('addressRow');
const addressTextEl = document.getElementById('addressText');
const addressLabelEl = document.getElementById('addressLabel');
const scanAreaEl = document.getElementById('scanArea');
const scanCaptionEl = document.getElementById('scanCaption');
const copyBtnEl = document.getElementById('copyBtn');
const startBtnEl = document.getElementById('startBtn');
const startBtnLabelEl = document.getElementById('startBtnLabel');
const messageEl = document.getElementById('message');
const qrcodeEl = document.getElementById('qrcode');
const badgeEl = document.getElementById('badge');

let pollInterval = null;

function setStatus(running, text) {
  if (running) {
    statusLedEl.classList.remove('off');
  } else {
    statusLedEl.classList.add('off');
  }
  statusTextEl.textContent = text || (running ? 'Server running' : 'Server offline');
}

async function getStatus() {
  try {
    const response = await fetch('http://127.0.0.1:8765/api/status', { cache: 'no-store' });
    const data = await response.json();
    setStatus(true, 'Server running');
    
    const url = data.primaryUrl || 'http://localhost:8765';
    addressTextEl.textContent = url;
    
    // Show active elements
    addressRowEl.classList.remove('hidden');
    addressLabelEl.style.display = 'block';
    copyBtnEl.classList.remove('hidden');
    scanAreaEl.classList.remove('hidden');
    scanCaptionEl.classList.remove('hidden');
    startBtnEl.classList.add('hidden');
    
    qrcodeEl.innerHTML = '';
    new QRCode(qrcodeEl, {
      text: url,
      width: 148,
      height: 148,
      colorDark: "#16181d",
      colorLight: "#f1efe9",
      correctLevel: QRCode.CorrectLevel.M
    });
    
    if (data.connections !== undefined) {
      badgeEl.textContent = `${data.connections} connected`;
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.style.display = 'none';
    }

    return data;
  } catch (error) {
    setStatus(false, 'Server offline');
    
    addressRowEl.classList.add('hidden');
    addressLabelEl.style.display = 'none';
    copyBtnEl.classList.add('hidden');
    scanAreaEl.classList.add('hidden');
    scanCaptionEl.classList.add('hidden');
    startBtnEl.classList.remove('hidden');
    badgeEl.style.display = 'none';
    
    return null;
  }
}

function startServer() {
  startBtnEl.disabled = true;
  startBtnLabelEl.textContent = 'Starting…';
  messageEl.textContent = '';

  chrome.runtime.sendMessage({ type: 'start-server' }, async (result) => {
    if (chrome.runtime.lastError) {
      messageEl.textContent = chrome.runtime.lastError.message;
      startBtnEl.disabled = false;
      startBtnLabelEl.textContent = 'Start Server';
      return;
    }

    if (!result?.ok) {
      messageEl.textContent = result?.error || 'Could not start the server.';
      startBtnEl.disabled = false;
      startBtnLabelEl.textContent = 'Start Server';
      return;
    }

    await waitForServer();
    startBtnEl.disabled = false;
    startBtnLabelEl.textContent = 'Start Server';
  });
}

async function waitForServer() {
  for (let i = 0; i < 20; i += 1) {
    const data = await getStatus();
    if (data) return data;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  messageEl.textContent = 'Server started, but is not responding yet. Check server\\server.log.';
}

async function copyLink() {
  const url = addressTextEl.textContent;
  try {
    await navigator.clipboard.writeText(url);
  } catch (error) {
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  
  const label = document.getElementById("btnLabel");
  const icon = document.getElementById("btnIcon");
  const prevLabel = label.textContent;
  const prevIcon = icon.innerHTML;
  label.textContent = "Copied";
  icon.innerHTML = '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  setTimeout(() => {
    label.textContent = prevLabel;
    icon.innerHTML = prevIcon;
  }, 1600);
}

copyBtnEl.addEventListener('click', copyLink);
addressRowEl.addEventListener('click', copyLink);
addressRowEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { 
    e.preventDefault(); 
    copyLink(); 
  }
});
startBtnEl.addEventListener('click', startServer);

// Opening the extension automatically starts the local server.
(async () => {
  const data = await getStatus();
  if (!data) startServer();
  
  if (!pollInterval) {
    pollInterval = setInterval(getStatus, 2000);
  }
})();
