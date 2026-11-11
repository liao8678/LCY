(() => {
  'use strict';
  const button = document.querySelector('#install-button');
  const help = document.querySelector('#install-help');
  let prompt;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  help.hidden = Boolean(standalone());
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event;
    button.hidden = Boolean(standalone());
  });
  button.addEventListener('click', async () => {
    if (!prompt) return;
    const pending = prompt;
    prompt = null;
    button.hidden = true;
    await pending.prompt();
    await pending.userChoice;
  });
  window.addEventListener('appinstalled', () => {
    prompt = null;
    button.hidden = true;
    help.hidden = true;
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      help.hidden = false;
      help.textContent = '離線功能尚未啟用，請保持連線並重新開啟網頁。';
    });
  }
})();
