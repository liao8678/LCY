(() => {
  'use strict';
  const button = document.querySelector('#install-button');
  const help = document.querySelector('#install-help');
  const offline = document.querySelector('#offline-note');
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

  const updateOffline = () => {
    const date = document.querySelector('#updated')?.textContent;
    offline.textContent = `目前離線：顯示的是上次下載的開獎資料${date && date !== '—' ? `（更新於 ${date}）` : ''}，連線後重新整理即可取得最新資料。`;
    offline.hidden = navigator.onLine;
  };
  window.addEventListener('online', updateOffline);
  window.addEventListener('offline', updateOffline);
  window.addEventListener('lottery:loaded', updateOffline);
  updateOffline();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      help.hidden = false;
      help.textContent = '離線功能尚未啟用，請保持連線並重新開啟網頁。';
    });
  }
})();
