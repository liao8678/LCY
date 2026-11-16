(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const tooltip = $('#tooltip');
  const SVG = 'http://www.w3.org/2000/svg';
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (n) => n.toLocaleString('zh-TW');
  let allDraws = [];

  function el(tag, attrs = {}, text) {
    const node = tag.startsWith('svg:') ? document.createElementNS(SVG, tag.slice(4)) : document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---- 統計：卡方分布右尾機率（正規化不完全 Gamma 函數 Q(a, x)）----
  function logGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (const v of c) ser += v / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    const gln = logGamma(a);
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 500; n++) { del *= x / ++ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  const chiSquareP = (stat, df) => gammaQ(df / 2, stat / 2);

  function binomial(n, k) {
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return r;
  }

  // ---- 圖表：單一數列直條圖，含懸停提示與鍵盤焦點 ----
  function showTip(html, x, y) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const { width, height } = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x + 14), window.innerWidth - width - 8);
    const top = y - height - 14 < 8 ? y + 18 : y - height - 14;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  const hideTip = () => { tooltip.hidden = true; };

  function columnChart(container, items, { reference, height = 220, labelEvery = 1 } = {}) {
    container.replaceChildren();
    const width = Math.max(320, container.clientWidth || 640);
    const m = { top: 18, right: 8, bottom: 26, left: 36 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const refs = Array.isArray(reference) ? reference : [reference || 0];
    const maxValue = Math.max(1, ...refs, ...items.map((d) => d.value));
    const step = niceStep(maxValue / 4);
    const top = Math.ceil(maxValue / step) * step;
    const y = (v) => m.top + h - (v / top) * h;
    const band = w / items.length;
    const barWidth = Math.min(24, Math.max(4, band - 2));
    const svg = el('svg:svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': container.dataset.label || '' });

    for (let v = 0; v <= top + 1e-9; v += step) {
      svg.append(el('svg:line', { class: 'grid', x1: m.left, x2: width - m.right, y1: y(v), y2: y(v) }));
      svg.append(el('svg:text', { x: m.left - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmt(Math.round(v))));
    }
    items.forEach((d, i) => {
      const cx = m.left + band * i + band / 2;
      const x0 = cx - barWidth / 2;
      const y0 = y(d.value);
      const r = Math.min(4, (m.top + h - y0), barWidth / 2);
      const g = el('svg:g');
      const hit = el('svg:rect', { class: 'hit', x: m.left + band * i, y: m.top, width: band, height: h, tabindex: '0', 'aria-label': d.aria });
      const bar = el('svg:path', { class: 'bar', d: d.value > 0
        ? `M${x0},${m.top + h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barWidth - r} Q${x0 + barWidth},${y0} ${x0 + barWidth},${y0 + r} V${m.top + h} Z`
        : '' });
      const enter = (event) => {
        bar.classList.add('active');
        const box = hit.getBoundingClientRect();
        showTip(d.tip, event.clientX ?? box.left + box.width / 2, event.clientY ?? box.top + box.height / 3);
      };
      hit.addEventListener('pointermove', enter);
      hit.addEventListener('pointerleave', () => { bar.classList.remove('active'); hideTip(); });
      hit.addEventListener('focus', () => enter({}));
      hit.addEventListener('blur', () => { bar.classList.remove('active'); hideTip(); });
      g.append(bar, hit);
      svg.append(g);
      if (i % labelEvery === 0) {
        svg.append(el('svg:text', { x: cx, y: height - 8, 'text-anchor': 'middle' }, d.label));
      }
    });
    svg.append(el('svg:line', { class: 'baseline', x1: m.left, x2: width - m.right, y1: m.top + h, y2: m.top + h }));
    if (Array.isArray(reference)) {
      const pts = reference.map((v, i) => `${m.left + band * i + band / 2},${y(v)}`).join(' ');
      svg.append(el('svg:polyline', { class: 'ref', points: pts }));
    } else if (reference) {
      svg.append(el('svg:line', { class: 'ref', x1: m.left, x2: width - m.right, y1: y(reference), y2: y(reference) }));
    }
    container.append(svg);
  }

  function niceStep(raw) {
    const p = 10 ** Math.floor(Math.log10(raw || 1));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function table(container, headers, rows) {
    const t = el('table');
    const head = el('tr');
    headers.forEach((h) => head.append(el('th', {}, h)));
    const thead = el('thead');
    thead.append(head);
    t.append(thead);
    const body = el('tbody');
    rows.forEach((r) => { const tr = el('tr'); r.forEach((c) => tr.append(el('td', {}, String(c)))); body.append(tr); });
    t.append(body);
    container.replaceChildren(t);
  }

  function balls(first, second, small = false) {
    const wrap = el('span', { class: 'balls' });
    first.forEach((n) => wrap.append(el('span', { class: `ball${small ? ' sm' : ''}`, 'aria-label': `第一區 ${n}` }, pad(n))));
    wrap.append(el('span', { class: `ball second${small ? ' sm' : ''}`, 'aria-label': `第二區 ${second}` }, String(second)));
    return wrap;
  }

  // ---- 分析 ----
  function analyse(draws) {
    const n = draws.length;
    const first = Array.from({ length: 39 }, () => 0);
    const second = Array.from({ length: 9 }, () => 0);
    const lastSeen = Array.from({ length: 39 }, () => -1);
    const lastSeenSecond = Array.from({ length: 9 }, () => -1);
    const odd = Array.from({ length: 7 }, () => 0);
    const sums = new Map();
    draws.forEach((d, i) => {
      d.first.forEach((x) => { first[x]++; lastSeen[x] = i; });
      second[d.second]++; lastSeenSecond[d.second] = i;
      odd[d.first.filter((x) => x % 2).length]++;
      const bucket = Math.floor(d.first.reduce((a, b) => a + b, 0) / 10) * 10;
      sums.set(bucket, (sums.get(bucket) || 0) + 1);
    });
    const gap = (i) => (i < 0 ? n : n - 1 - i);
    return {
      n,
      first: first.slice(1).map((count, i) => ({ number: i + 1, count, gap: gap(lastSeen[i + 1]) })),
      second: second.slice(1).map((count, i) => ({ number: i + 1, count, gap: gap(lastSeenSecond[i + 1]) })),
      odd, sums,
    };
  }

  function render(range) {
    const draws = range === 'all' ? allDraws : allDraws.slice(-Number(range));
    const s = analyse(draws);
    const n = s.n;
    const expFirst = (n * 6) / 38;
    const expSecond = n / 8;

    $('#tile-count').textContent = `${fmt(n)} 期`;
    $('#tile-range').textContent = `${draws[0].date} ～ ${draws[n - 1].date}`;

    // 每期 6 個號碼不重複，Pearson 統計量乘 37/32 校正後近似自由度 37 的卡方分布。
    const chi = s.first.reduce((a, d) => a + (d.count - expFirst) ** 2 / expFirst, 0) * (37 / 32);
    const p = chiSquareP(chi, 37);
    $('#tile-chi').textContent = `p = ${p < 0.001 ? '< 0.001' : p.toFixed(2)}`;
    $('#tile-chi-sub').textContent = p >= 0.05
      ? '差異在隨機波動範圍內，看不出偏好號碼'
      : '差異超出一般隨機波動（多次比較下仍可能是巧合）';

    $('#first-caption').textContent = `虛線為平均期望值 ${expFirst.toFixed(1)} 次（每期 6 個號碼 ÷ 38）。`;
    columnChart($('#chart-first'), s.first.map((d) => ({
      label: pad(d.number), value: d.count,
      aria: `${pad(d.number)} 號，出現 ${d.count} 次，已 ${d.gap} 期未開`,
      tip: `<b>${pad(d.number)} 號</b><br>出現 ${fmt(d.count)} 次（${(d.count / n * 100).toFixed(1)}% 的期數）<br>與期望值差 ${(d.count - expFirst >= 0 ? '+' : '')}${(d.count - expFirst).toFixed(1)}<br>已連續 ${d.gap} 期未開`,
    })), { reference: expFirst, height: 240, labelEvery: window.innerWidth < 600 ? 4 : 1 });
    table($('#table-first'), ['號碼', '出現次數', '出現比例', '與期望差', '未開期數'],
      s.first.map((d) => [pad(d.number), d.count, `${(d.count / n * 100).toFixed(1)}%`, (d.count - expFirst).toFixed(1), d.gap]));

    $('#second-caption').textContent = `虛線為平均期望值 ${expSecond.toFixed(1)} 次（每期 1 個號碼 ÷ 8）。`;
    columnChart($('#chart-second'), s.second.map((d) => ({
      label: String(d.number), value: d.count,
      aria: `第二區 ${d.number}，出現 ${d.count} 次，已 ${d.gap} 期未開`,
      tip: `<b>第二區 ${d.number}</b><br>出現 ${fmt(d.count)} 次（${(d.count / n * 100).toFixed(1)}%）<br>已連續 ${d.gap} 期未開`,
    })), { reference: expSecond });
    table($('#table-second'), ['號碼', '出現次數', '出現比例', '未開期數'],
      s.second.map((d) => [d.number, d.count, `${(d.count / n * 100).toFixed(1)}%`, d.gap]));

    const fill = (selector, list, value) => {
      $(selector).replaceChildren(...list.map((d) => {
        const li = el('li');
        li.append(el('strong', {}, pad(d.number)), el('span', {}, value(d)));
        return li;
      }));
    };
    const byCount = [...s.first].sort((a, b) => b.count - a.count || a.number - b.number);
    fill('#hot-list', byCount.slice(0, 6), (d) => `${d.count} 次`);
    fill('#cold-list', byCount.slice(-6).reverse(), (d) => `${d.count} 次`);
    fill('#gap-list', [...s.first].sort((a, b) => b.gap - a.gap || a.number - b.number).slice(0, 6), (d) => `${d.gap} 期`);

    // 奇數個數：19 奇 19 偶，理論機率為超幾何分布。
    const total = binomial(38, 6);
    const oddExpected = s.odd.map((_, k) => n * binomial(19, k) * binomial(19, 6 - k) / total);
    columnChart($('#chart-odd'), s.odd.map((count, k) => ({
      label: `${k} 奇`, value: count,
      aria: `${k} 個奇數，${count} 期，理論 ${oddExpected[k].toFixed(1)} 期`,
      tip: `<b>${k} 奇 ${6 - k} 偶</b><br>實際 ${fmt(count)} 期（${(count / n * 100).toFixed(1)}%）<br>理論 ${oddExpected[k].toFixed(1)} 期`,
    })), { reference: oddExpected });
    table($('#table-odd'), ['奇偶', '實際期數', '比例', '理論期數'],
      s.odd.map((count, k) => [`${k} 奇 ${6 - k} 偶`, count, `${(count / n * 100).toFixed(1)}%`, oddExpected[k].toFixed(1)]));

    const buckets = [];
    for (let b = 20; b <= 210; b += 10) buckets.push(b);
    const sumItems = buckets.map((b) => ({ b, count: s.sums.get(b) || 0 }))
      .filter((d, i, arr) => d.count || (arr.slice(0, i).some((x) => x.count) && arr.slice(i).some((x) => x.count)));
    columnChart($('#chart-sum'), sumItems.map((d) => ({
      label: String(d.b), value: d.count,
      aria: `總和 ${d.b} 到 ${d.b + 9}，${d.count} 期`,
      tip: `<b>總和 ${d.b}–${d.b + 9}</b><br>${fmt(d.count)} 期（${(d.count / n * 100).toFixed(1)}%）`,
    })), { labelEvery: 2 });
    table($('#table-sum'), ['總和區間', '期數', '比例'],
      sumItems.map((d) => [`${d.b}–${d.b + 9}`, d.count, `${(d.count / n * 100).toFixed(1)}%`]));
  }

  function renderStatic(data) {
    const latest = allDraws[allDraws.length - 1];
    $('#latest-period').textContent = `第 ${latest.period} 期`;
    $('#latest-balls').replaceWith(Object.assign(balls(latest.first, latest.second), { id: 'latest-balls' }));
    $('#latest-date').textContent = `${latest.date} 開獎；右側實心為第二區`;
    $('#updated').textContent = data.updated;

    const t = el('table');
    const head = el('tr');
    ['期別', '開獎日', '第一區（由小到大）＋第二區'].forEach((h) => head.append(el('th', {}, h)));
    const thead = el('thead');
    thead.append(head);
    t.append(thead);
    const body = el('tbody');
    allDraws.slice(-20).reverse().forEach((d) => {
      const tr = el('tr');
      const cell = el('td');
      cell.append(balls(d.first, d.second, true));
      tr.append(el('td', {}, String(d.period)), el('td', {}, d.date), cell);
      body.append(tr);
    });
    t.append(body);
    $('#recent').replaceChildren(t);
  }

  let current = 'all';
  document.querySelectorAll('[data-range]').forEach((button) => {
    button.addEventListener('click', () => {
      current = button.dataset.range;
      document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      render(current);
    });
  });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => allDraws.length && render(current), 150); });

  fetch('./data.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((data) => {
      allDraws = data.draws;
      if (!allDraws.length) throw new Error('沒有開獎資料');
      $('#status').hidden = true;
      $('#content').hidden = false;
      renderStatic(data);
      render(current);
    })
    .catch((error) => {
      const status = $('#status');
      status.textContent = `開獎資料載入失敗：${error.message}。請重新整理頁面。`;
      status.classList.add('error');
    });
})();
