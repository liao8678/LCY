(() => {
  'use strict';

  const form = document.querySelector('#repair-form');
  const fields = document.querySelector('#form-fields');
  const submitButton = document.querySelector('#submit-button');
  const refreshButton = document.querySelector('#refresh-button');
  const formMessage = document.querySelector('#form-message');
  const listMessage = document.querySelector('#list-message');
  const list = document.querySelector('#request-list');
  const count = document.querySelector('#request-count');
  const connectionMessage = document.querySelector('#connection-message');
  let client;
  let submitting = false;
  let loading = false;

  function message(element, text, type = '') {
    element.textContent = text;
    element.className = `message ${type}`;
    element.hidden = !text;
  }

  function errorText(error) {
    return error?.message || '無法連線，請檢查網路後再試一次。';
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  const dateFormatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });

  function renderRequest(request) {
    const card = element('article', 'request-card', '');
    const top = element('div', 'request-top', '');
    const urgencyClass = { '低': 'low', '中': 'medium', '高': 'high' }[request.urgency] || 'unknown';
    top.append(element('span', 'badge', request.category),
      element('span', `badge urgency-${urgencyClass}`, `緊急程度：${request.urgency}`));
    if (request.status) top.append(element('span', 'badge', request.status));
    const date = new Date(request.created_at);
    const time = element('time', 'request-time', Number.isNaN(date.getTime()) ? '登記時間未提供' : `${dateFormatter.format(date)}（台北）`);
    if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
    top.append(time);
    card.append(top, element('p', 'request-description', request.description),
      element('p', 'request-meta', `${request.reporter_name} · ${request.location}`));
    return card;
  }

  async function loadRequests() {
    if (loading) return;
    if (!navigator.onLine) {
      message(listMessage, '目前離線，無法載入最新清單；請連線後按「重新整理」。');
      return;
    }
    loading = true;
    refreshButton.disabled = true;
    submitButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    message(listMessage, '正在載入報修紀錄…');
    try {
      const { data, error } = await client.from('repair_requests')
        .select('id,reporter_name,location,category,description,urgency,status,created_at')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
      if (error) throw error;
      list.replaceChildren(...data.map(renderRequest));
      count.textContent = String(data.length);
      message(listMessage, data.length ? '' : '目前還沒有報修紀錄，從上方登記第一筆吧。');
    } catch (error) {
      message(listMessage, `清單載入失敗：${errorText(error)}${list.childElementCount ? ' 下方保留上次載入的紀錄。' : ''} 請按「重新整理」重試。`, 'error');
    } finally {
      loading = false;
      refreshButton.disabled = submitting || !navigator.onLine;
      submitButton.disabled = submitting || !navigator.onLine;
      list.setAttribute('aria-busy', 'false');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || !client) return;
    if (!navigator.onLine) {
      message(formMessage, '目前離線，尚未送出；請恢復連線後手動送出。', 'error');
      return;
    }
    const values = new FormData(form);
    const payload = Object.fromEntries(['reporter_name', 'location', 'category', 'description', 'urgency']
      .map((key) => [key, String(values.get(key) || '').trim()]));
    if (Object.values(payload).some((value) => !value)) {
      message(formMessage, '請完整填寫所有欄位，內容不能只有空白。', 'error');
      return;
    }
    submitting = true;
    fields.disabled = true;
    // Prevent a manual refresh from overlapping the post-submit refresh.
    refreshButton.disabled = true;
    submitButton.textContent = '送出中…';
    message(formMessage, '正在送出，請稍候…');
    try {
      // id、created_at、status 均由資料庫預設值產生，不能放進新增 payload。
      const { error } = await client.from('repair_requests').insert(payload);
      if (error) throw error;
      form.reset();
      message(formMessage, '報修登記成功！已收到你的問題。', 'success');
      await loadRequests();
    } catch (error) {
      message(formMessage, `送出失敗：${errorText(error)} 表單內容已保留；若連線中斷，請先重新整理清單確認是否已登記，再決定是否重送。`, 'error');
    } finally {
      submitting = false;
      fields.disabled = false;
      submitButton.disabled = loading || !navigator.onLine;
      refreshButton.disabled = loading || !navigator.onLine;
      submitButton.textContent = '送出報修 ↗';
    }
  });

  refreshButton.addEventListener('click', () => loadRequests());
  function initializeClient() {
    try {
      const config = window.REPAIR_CONFIG;
      if (!window.supabase || !config?.supabaseUrl || !config?.supabasePublishableKey) {
        throw new Error('服務設定或 Supabase 程式載入失敗，請重新載入頁面。');
      }
      client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      fields.disabled = false;
      message(formMessage, '');
      loadRequests();
    } catch (error) {
      fields.disabled = navigator.onLine;
      submitButton.disabled = true;
      refreshButton.disabled = true;
      list.setAttribute('aria-busy', 'false');
      message(formMessage, errorText(error), 'error');
      message(listMessage, '服務尚未連線，暫時無法載入報修紀錄。', 'error');
    }
  }

  function updateConnection() {
    const offline = !navigator.onLine;
    message(connectionMessage, offline
      ? '目前離線：可查看表單，報修尚未送出。請保持此頁開啟，恢復連線後手動送出；關閉或重載頁面不會保留填寫內容。清單需連線才能更新。'
      : '');
    submitButton.disabled = offline || !client || submitting || loading;
    refreshButton.disabled = offline || !client || submitting || loading;
    if (offline) {
      list.setAttribute('aria-busy', 'false');
      message(listMessage, list.childElementCount
        ? '目前離線，下方是本頁先前載入的紀錄，尚未更新。'
        : '目前離線，無法載入最新清單；請連線後按「重新整理」。');
    }
  }
  window.addEventListener('offline', updateConnection);
  window.addEventListener('online', () => {
    if (!client) initializeClient();
    updateConnection();
    if (client && !submitting) loadRequests();
  });
  initializeClient();
  updateConnection();
})();
