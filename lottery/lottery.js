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
    headers.forEach((h) => head.append(typeof h === 'object' ? el('th', { class: h.className }, h.text) : el('th', {}, h)));
    const thead = el('thead');
    thead.append(head);
    t.append(thead);
    const body = el('tbody');
    rows.forEach((r) => {
      const tr = el('tr');
      if (r.rowClass) tr.className = r.rowClass;
      r.forEach((c) => {
        if (c && typeof c === 'object' && c.badge) {
          const td = el('td');
          td.append(el('span', { class: c.badge }, c.text));
          tr.append(td);
        } else tr.append(c && typeof c === 'object' ? el('td', { class: c.className || '' }, c.text) : el('td', {}, String(c)));
      });
      body.append(tr);
    });
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
    draws.forEach((d, i) => {
      d.first.forEach((x) => { first[x]++; lastSeen[x] = i; });
      second[d.second]++; lastSeenSecond[d.second] = i;
      odd[d.first.filter((x) => x % 2).length]++;
    });
    const gap = (i) => (i < 0 ? n : n - 1 - i);
    return {
      n,
      first: first.slice(1).map((count, i) => ({ number: i + 1, count, gap: gap(lastSeen[i + 1]) })),
      second: second.slice(1).map((count, i) => ({ number: i + 1, count, gap: gap(lastSeenSecond[i + 1]) })),
      odd,
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

    renderSums(draws);
    renderPrizes(draws);
    renderCompare(draws, s);
    renderBacktest(draws.length);
  }

  // ---- 號碼總和 ----
  const sumOf = (d) => d.first.reduce((a, b) => a + b, 0);
  const TOTAL_COMBOS = binomial(38, 6);

  // 38 選 6 所有組合的總和分布（動態規劃），ways[s] 為總和 s 的組合數。
  const SUM_WAYS = (() => {
    let dp = Array.from({ length: 7 }, () => new Float64Array(214));
    dp[0][0] = 1;
    for (let x = 1; x <= 38; x++) {
      for (let k = 6; k >= 1; k--) {
        for (let t = 213; t >= x; t--) dp[k][t] += dp[k - 1][t - x];
      }
    }
    return dp[6];
  })();
  const theoryShare = (lo, hi) => {
    let w = 0;
    for (let t = Math.max(21, lo); t <= Math.min(213, hi); t++) w += SUM_WAYS[t];
    return w / TOTAL_COMBOS;
  };
  const THEORY_MEAN = 117;
  const THEORY_SD = Math.sqrt(6 * ((38 * 38 - 1) / 12) * (32 / 37));

  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
  }

  function tile(label, value, sub) {
    const t = el('div', { class: 'tile' });
    t.append(el('span', { class: 'tile-label' }, label), el('span', { class: 'tile-value' }, value), el('span', { class: 'tile-sub' }, sub));
    return t;
  }

  function renderSums(draws) {
    const n = draws.length;
    const sums = draws.map(sumOf);
    const sorted = [...sums].sort((a, b) => a - b);
    const mean = sums.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(sums.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
    const minIndex = sums.indexOf(sorted[0]);
    const maxIndex = sums.lastIndexOf(sorted[n - 1]);
    const lo = Math.round(THEORY_MEAN - THEORY_SD);
    const hi = Math.round(THEORY_MEAN + THEORY_SD);
    const inMiddle = sums.filter((v) => v >= lo && v <= hi).length;
    const latest = sums[n - 1];
    const lowerShare = sorted.filter((v) => v < latest).length / n;

    $('#sum-tiles').replaceChildren(
      tile('平均總和', mean.toFixed(1), `理論 ${THEORY_MEAN.toFixed(1)}`),
      tile('中位數', quantile(sorted, 0.5).toFixed(0), `中間 50%：${quantile(sorted, 0.25).toFixed(0)}–${quantile(sorted, 0.75).toFixed(0)}`),
      tile('標準差', sd.toFixed(1), `理論 ${THEORY_SD.toFixed(1)}`),
      tile('最小總和', String(sorted[0]), `${draws[minIndex].date}（${draws[minIndex].first.map(pad).join(' ')}）`),
      tile('最大總和', String(sorted[n - 1]), `${draws[maxIndex].date}（${draws[maxIndex].first.map(pad).join(' ')}）`),
      tile('最新一期總和', String(latest), `比統計範圍內 ${Math.round(lowerShare * 100)}% 的期數高`),
    );

    // 分布：每 5 為一組，附精確理論期數。
    const width = 5;
    const first = Math.floor(Math.min(sorted[0], 60) / width) * width;
    const last = Math.floor(Math.max(sorted[n - 1], 175) / width) * width;
    const bins = [];
    for (let b = first; b <= last; b += width) {
      const count = sums.filter((v) => v >= b && v < b + width).length;
      bins.push({ b, count, expected: n * theoryShare(b, b + width - 1) });
    }
    columnChart($('#chart-sum'), bins.map((d) => ({
      label: String(d.b), value: d.count,
      aria: `總和 ${d.b} 到 ${d.b + width - 1}，實際 ${d.count} 期，理論 ${d.expected.toFixed(1)} 期`,
      tip: `<b>總和 ${d.b}–${d.b + width - 1}</b><br>實際 ${fmt(d.count)} 期（${(d.count / n * 100).toFixed(1)}%）<br>理論 ${d.expected.toFixed(1)} 期（${(d.expected / n * 100).toFixed(1)}%）`,
    })), { reference: bins.map((d) => d.expected), height: 240, labelEvery: window.innerWidth < 600 ? 4 : 2 });
    table($('#table-sum'), ['總和區間', '實際期數', '實際比例', '理論比例'],
      bins.map((d) => [`${d.b}–${d.b + width - 1}`, d.count, `${(d.count / n * 100).toFixed(1)}%`, `${(d.expected / n * 100).toFixed(1)}%`]));

    const bands = [
      ['偏低', `21–${lo - 1}`, 21, lo - 1],
      ['中間', `${lo}–${hi}`, lo, hi],
      ['偏高', `${hi + 1}–213`, hi + 1, 213],
    ];
    table($('#sum-bands'), ['區間', '總和', '實際期數', '實際比例', '理論比例'], bands.map(([name, label, a, b]) => {
      const count = sums.filter((v) => v >= a && v <= b).length;
      return [name, label, count, `${(count / n * 100).toFixed(1)}%`, `${(theoryShare(a, b) * 100).toFixed(1)}%`];
    }));

    const all = draws.map((d) => sumOf(d) + d.second);
    const allSorted = [...all].sort((a, b) => a - b);
    const allMean = all.reduce((a, b) => a + b, 0) / n;
    table($('#sum-all'), ['項目', '數值'], [
      ['平均（理論 121.5）', allMean.toFixed(1)],
      ['中位數', quantile(allSorted, 0.5).toFixed(0)],
      ['中間 50% 範圍', `${quantile(allSorted, 0.25).toFixed(0)}–${quantile(allSorted, 0.75).toFixed(0)}`],
      ['最小／最大', `${allSorted[0]}／${allSorted[n - 1]}`],
      ['最新一期', String(all[n - 1])],
    ]);

    // 走勢：每期總和與移動平均。
    const windowSize = n >= 200 ? 20 : n >= 100 ? 10 : 5;
    const ma = sums.map((_, i) => (i + 1 < windowSize ? null
      : sums.slice(i + 1 - windowSize, i + 1).reduce((a, b) => a + b, 0) / windowSize));
    $('#trend-legend').replaceChildren(
      Object.assign(el('span'), { innerHTML: '<i style="color:var(--series-1)"></i>每期總和' }),
      Object.assign(el('span'), { innerHTML: `<i style="color:var(--series-2)"></i>${windowSize} 期移動平均` }),
      Object.assign(el('span'), { innerHTML: `<i class="dash" style="color:var(--text-secondary)"></i>理論平均 ${THEORY_MEAN}` }),
    );
    lineChart($('#chart-trend'), draws, sums, ma, windowSize);
    const recent = draws.slice(-100).map((d, i) => [d.period, d.date, d.first.map(pad).join(' '), sums[n - Math.min(100, n) + i]]).reverse();
    table($('#table-trend'), ['期別', '開獎日', '第一區', '總和'], recent);
  }

  function lineChart(container, draws, sums, ma, windowSize) {
    container.replaceChildren();
    const width = Math.max(320, container.clientWidth || 640);
    const height = 260;
    const m = { top: 16, right: 88, bottom: 26, left: 36 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const n = sums.length;
    const yMin = Math.min(20, Math.floor(Math.min(...sums) / 20) * 20);
    const yMax = Math.max(220, Math.ceil(Math.max(...sums) / 20) * 20);
    const x = (i) => m.left + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const y = (v) => m.top + h - ((v - yMin) / (yMax - yMin)) * h;
    const svg = el('svg:svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `各期總和走勢，共 ${n} 期` });
    for (let v = yMin; v <= yMax; v += 40) {
      svg.append(el('svg:line', { class: 'grid', x1: m.left, x2: m.left + w, y1: y(v), y2: y(v) }));
      svg.append(el('svg:text', { x: m.left - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
    }
    // X 軸：跨年時每隔固定年數標示，否則標示月份；間距固定。
    const keyOf = (d) => (years.size >= 3 ? d.date.slice(0, 4) : d.date.slice(0, 7));
    const years = new Set(draws.map((d) => d.date.slice(0, 4)));
    const starts = [];
    draws.forEach((d, i) => { if (!i || keyOf(d) !== keyOf(draws[i - 1])) starts.push(i); });
    const minGap = years.size >= 3 ? 44 : 64;
    const every = Math.max(1, Math.ceil(minGap / (w / Math.max(1, starts.length))));
    starts.forEach((i, k) => {
      if (k % every === 0 && x(i) <= m.left + w - 30) {
        svg.append(el('svg:text', { x: x(i), y: height - 8, 'text-anchor': 'start' }, keyOf(draws[i])));
      }
    });
    svg.append(el('svg:line', { class: 'ref', x1: m.left, x2: m.left + w, y1: y(THEORY_MEAN), y2: y(THEORY_MEAN) }));
    svg.append(el('svg:polyline', { class: 'line-raw', points: sums.map((v, i) => `${x(i)},${y(v)}`).join(' ') }));
    const maPts = ma.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
    if (maPts.length) svg.append(el('svg:polyline', { class: 'line-ma', points: maPts.join(' ') }));
    const lastMa = ma[n - 1];
    if (lastMa !== null) svg.append(el('svg:text', { class: 'direct-label', x: m.left + w + 6, y: y(lastMa) + 4 }, `移動平均 ${lastMa.toFixed(0)}`));

    const cross = el('svg:line', { class: 'crosshair', y1: m.top, y2: m.top + h, visibility: 'hidden' });
    const dotRaw = el('svg:circle', { class: 'dot-raw', r: 4, visibility: 'hidden' });
    const dotMa = el('svg:circle', { class: 'dot-ma', r: 4, visibility: 'hidden' });
    const overlay = el('svg:rect', { x: m.left, y: m.top, width: w, height: h, fill: 'transparent' });
    svg.append(cross, dotRaw, dotMa, overlay);
    container.append(svg);

    let active = n - 1;
    const show = (i, clientX, clientY) => {
      active = Math.max(0, Math.min(n - 1, i));
      const d = draws[active];
      cross.setAttribute('x1', x(active)); cross.setAttribute('x2', x(active));
      dotRaw.setAttribute('cx', x(active)); dotRaw.setAttribute('cy', y(sums[active]));
      cross.setAttribute('visibility', 'visible'); dotRaw.setAttribute('visibility', 'visible');
      if (ma[active] !== null) {
        dotMa.setAttribute('cx', x(active)); dotMa.setAttribute('cy', y(ma[active]));
        dotMa.setAttribute('visibility', 'visible');
      } else dotMa.setAttribute('visibility', 'hidden');
      if (clientX === undefined) {
        const box = svg.getBoundingClientRect();
        const scale = box.width / width;
        clientX = box.left + x(active) * scale;
        clientY = box.top + y(sums[active]) * scale;
      }
      showTip(`<b>第 ${d.period} 期</b>　${d.date}<br>${d.first.map(pad).join(' ')}<br>總和 <b>${sums[active]}</b>${ma[active] !== null ? `<br>${windowSize} 期移動平均 ${ma[active].toFixed(1)}` : ''}`, clientX, clientY);
    };
    const hide = () => {
      [cross, dotRaw, dotMa].forEach((node) => node.setAttribute('visibility', 'hidden'));
      hideTip();
    };
    overlay.addEventListener('pointermove', (event) => {
      const box = svg.getBoundingClientRect();
      const px = (event.clientX - box.left) * (width / box.width);
      show(Math.round(((px - m.left) / w) * (n - 1)), event.clientX, event.clientY);
    });
    overlay.addEventListener('pointerleave', hide);
    container.onfocus = () => show(active);
    container.onblur = hide;
    container.onkeydown = (event) => {
      const stepSize = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - stepSize); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(active + stepSize); }
      if (event.key === 'Escape') hide();
    };
  }

  // ---- 各獎項機率 ----
  const ALL_COMBOS = binomial(38, 6) * 8;
  // [名稱, 中獎條件, 第一區對中數, 是否需對中第二區]
  const PRIZES = [
    ['頭獎', '6 個＋第二區', 6, true], ['貳獎', '6 個', 6, false],
    ['參獎', '5 個＋第二區', 5, true], ['肆獎', '5 個', 5, false],
    ['伍獎', '4 個＋第二區', 4, true], ['陸獎', '4 個', 4, false],
    ['柒獎', '3 個＋第二區', 3, true], ['捌獎', '2 個＋第二區', 2, true],
    ['玖獎', '3 個', 3, false], ['普獎', '1 個＋第二區', 1, true],
  ].map(([name, rule, k, withSecond]) => {
    const ways = binomial(6, k) * binomial(32, 6 - k) * (withSecond ? 1 : 7);
    return { name, rule, ways, p: ways / ALL_COMBOS };
  });
  const oneIn = (p) => `1／${p > 0.01 ? (1 / p).toFixed(1) : fmt(Math.round(1 / p))}`;
  const pct = (v, digits = 1) => `${(v * 100).toFixed(digits)}%`;

  function renderPrizes(draws) {
    const withSales = draws.filter((d) => d.sales && Array.isArray(d.winners));
    const rows = PRIZES.map((prize, i) => {
      // 早期沒有玖獎，該期中獎注數為 0；只統計有設此獎的期數。
      const eligible = withSales.filter((d) => i !== 8 || d.winners[8] > 0);
      const expected = eligible.reduce((a, d) => a + (d.sales / 100) * prize.p, 0);
      const actual = eligible.reduce((a, d) => a + (d.winners[i] || 0), 0);
      return { ...prize, expected, actual, periods: eligible.length };
    });
    const totalP = PRIZES.reduce((a, d) => a + d.p, 0);
    const fmtCount = (v) => (v >= 100 ? fmt(Math.round(v)) : v.toFixed(1));
    const body = rows.map((d) => [d.name, d.rule, fmt(d.ways), oneIn(d.p), pct(d.p, Math.max(2, Math.ceil(-Math.log10(d.p * 100)) + 1)),
      withSales.length ? fmtCount(d.expected) : '—', withSales.length ? fmt(d.actual) : '—',
      withSales.length && d.expected ? `${(d.actual / d.expected).toFixed(2)} 倍` : '—']);
    const sumExp = rows.reduce((a, d) => a + d.expected, 0);
    const sumAct = rows.reduce((a, d) => a + d.actual, 0);
    const total = ['任一獎項', '', fmt(PRIZES.reduce((a, d) => a + d.ways, 0)), oneIn(totalP), pct(totalP, 2),
      withSales.length ? fmt(Math.round(sumExp)) : '—', withSales.length ? fmt(sumAct) : '—',
      withSales.length ? `${(sumAct / sumExp).toFixed(2)} 倍` : '—'];
    total.rowClass = 'total';
    table($('#prize-table'), ['獎項', '中獎條件', '組合數', '機率', '百分比', '理論中獎注數', '實際中獎注數', '實際 ÷ 理論'], [...body, total]);
    const tickets = withSales.reduce((a, d) => a + d.sales / 100, 0);
    const ninthStart = withSales.find((d) => d.winners[8] > 0);
    $('#prize-note').textContent = withSales.length
      ? `統計範圍內共售出約 ${fmt(Math.round(tickets))} 注。${ninthStart && ninthStart !== withSales[0] ? `玖獎自 ${ninthStart.date} 起才設立，只計該日之後的期數。` : ''}長期加總後實際中獎注數與理論非常接近；單看某幾期則可能差很多，因為許多人選號並非隨機（偏好生日 1–31、連號、固定號碼），同一組號碼被很多人重複購買，中獎注數會忽多忽少。頭獎、貳獎每期期望值不到 1 注，波動更大。`
      : '目前資料沒有銷售與中獎注數，請重新執行 tools/fetch_power_lottery.py 下載。';
  }

  // ---- 理論值與實際值對照 ----
  function renderCompare(draws, s) {
    const n = draws.length;
    const C = binomial(38, 6);
    const rows = [];
    const verdict = (z) => (Math.abs(z) <= 2
      ? { text: '在隨機誤差內', badge: 'verdict ok' }
      : { text: '超出隨機誤差', badge: 'verdict off' });
    const addShare = (name, p, hits, trials, note) => {
      const share = hits / trials;
      const z = (share - p) / Math.sqrt(p * (1 - p) / trials);
      rows.push([name, pct(p), pct(share), `${share - p >= 0 ? '+' : ''}${((share - p) * 100).toFixed(1)} 個百分點`, verdict(z), { text: note, className: 'wrap' }]);
    };
    const addMean = (name, mu, sd, values, note, digits = 2) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const z = (mean - mu) / (sd / Math.sqrt(values.length));
      rows.push([name, mu.toFixed(digits), mean.toFixed(digits), `${mean - mu >= 0 ? '+' : ''}${(mean - mu).toFixed(digits)}`, verdict(z), { text: note, className: 'wrap' }]);
    };
    const addRange = (name, items, p, note) => {
      const mu = n * p;
      const sd = Math.sqrt(n * p * (1 - p));
      const lo = Math.max(0, Math.round(mu - 2.6 * sd));
      const hi = Math.round(mu + 2.6 * sd);
      const counts = items.map((d) => d.count);
      const min = Math.min(...counts);
      const max = Math.max(...counts);
      rows.push([name, `約 ${lo}–${hi} 次`, `${min}–${max} 次`, '—', verdict(min >= lo && max <= hi ? 0 : 3), { text: note, className: 'wrap' }]);
    };

    addRange('第一區各號碼出現次數', s.first, 6 / 38, '理論範圍取期望值 ± 2.6 個標準差，38 個號碼一起看時約 99% 會落在此範圍內。');
    addRange('第二區各號碼出現次數', s.second, 1 / 8, '同上，8 個號碼一起看。');
    const sums = draws.map(sumOf);
    addMean('第一區號碼總和平均', THEORY_MEAN, THEORY_SD, sums, '6 個號碼平均各 19.5，相加為 117。', 1);
    addShare('總和落在 92–142', theoryShare(92, 142), sums.filter((v) => v >= 92 && v <= 142).length, n, '理論平均 ± 1 個標準差。');
    const odds = draws.map((d) => d.first.filter((x) => x % 2).length);
    addMean('每期奇數個數平均', 3, Math.sqrt(6 * 0.5 * 0.5 * 32 / 37), odds, '1–38 奇偶各 19 個，平均一半是奇數。');
    addShare('3 奇 3 偶的期數', binomial(19, 3) ** 2 / C, s.odd[3], n, '最常見的奇偶組合，但也只約三分之一。');
    const hasRun = (d) => d.first.some((x, i) => i && x - d.first[i - 1] === 1);
    addShare('至少有一組連號', 1 - binomial(33, 6) / C, draws.filter(hasRun).length, n, '例如 12、13 同時開出。很多人以為連號少見，其實超過一半的期數都有。');
    addShare('6 個號碼都 ≤ 31', binomial(31, 6) / C, draws.filter((d) => d.first[5] <= 31).length, n, '也就是全部可用生日日期表示的組合。');
    const prevShare = draws.slice(1).filter((d, i) => d.first.some((x) => draws[i].first.includes(x))).length;
    addShare('與上一期至少重複 1 個號碼', 1 - binomial(32, 6) / C, prevShare, n - 1, '每期獨立開獎，重複號碼很常見。');
    addShare('第二區與上一期相同', 1 / 8, draws.slice(1).filter((d, i) => d.second === draws[i].second).length, n - 1, '每期都是 8 選 1，與上期無關。');

    table($('#compare-table'), ['項目', '理論值', '實際值', '差異', '判讀', { text: '說明', className: 'wrap' }], rows);
  }

  // ---- 選號方法回測 ----
  let backtestWindow = 100;
  const MATCH_VAR = 6 * (6 / 38) * (32 / 38) * (32 / 37);
  // 現行獎項：第一區對中 3 個以上，或對中 1 個以上且第二區也對中。
  const isWin = (k, second) => k >= 3 || (k >= 1 && second);
  const P_WIN = PRIZES.reduce((a, d) => a + d.p, 0);

  function seededRandom(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const METHODS = [
    { name: '熱門號', desc: `前 N 期出現最多的 6 個號碼` },
    { name: '冷門號', desc: '前 N 期出現最少的 6 個號碼' },
    { name: '最久未開', desc: '連續最多期沒開出的 6 個號碼' },
    { name: '照抄上期', desc: '直接使用上一期的開獎號碼' },
    { name: '隨機選號', desc: '電腦隨機選（固定亂數種子，結果可重現）' },
  ];

  const NUMBERS = Array.from({ length: 38 }, (_, i) => i + 1);
  const SECONDS = Array.from({ length: 8 }, (_, i) => i + 1);
  const pickBy = (list, key, n) => [...list].sort((a, b) => key(a) - key(b) || a - b).slice(0, n);
  const sample = (list, n, random) => {
    const pool = [...list];
    const out = [];
    for (let k = 0; k < n; k++) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return out;
  };

  // 依「到目前為止」的統計狀態，替每種方法選出第一區 n1 個、第二區 n2 個號碼。
  function makePicks(state, prev, random, n1, n2) {
    const { count, count2, lastSeen, lastSeen2 } = state;
    const hotFirst = (x) => -count[x];
    const hotSecond = (x) => -count2[x];
    const repeatFirst = [...prev.first, ...pickBy(NUMBERS.filter((x) => !prev.first.includes(x)), hotFirst, Math.max(0, n1 - 6))].slice(0, n1);
    const repeatSecond = [prev.second, ...pickBy(SECONDS.filter((x) => x !== prev.second), hotSecond, n2 - 1)];
    return [
      [pickBy(NUMBERS, hotFirst, n1), pickBy(SECONDS, hotSecond, n2)],
      [pickBy(NUMBERS, (x) => count[x], n1), pickBy(SECONDS, (x) => count2[x], n2)],
      [pickBy(NUMBERS, (x) => lastSeen[x], n1), pickBy(SECONDS, (x) => lastSeen2[x], n2)],
      [repeatFirst, repeatSecond],
      [sample(NUMBERS, n1, random), sample(SECONDS, n2, random)],
    ];
  }

  function buildState(endIndex, windowSize) {
    const state = { count: Array(39).fill(0), count2: Array(9).fill(0), lastSeen: Array(39).fill(-1), lastSeen2: Array(9).fill(-1) };
    for (let i = 0; i < endIndex; i++) {
      const d = allDraws[i];
      d.first.forEach((x) => { state.lastSeen[x] = i; if (i >= endIndex - windowSize) state.count[x]++; });
      state.lastSeen2[d.second] = i;
      if (i >= endIndex - windowSize) state.count2[d.second]++;
    }
    return state;
  }

  function backtest(rangeCount, windowSize, n1 = 6, n2 = 1) {
    const total = allDraws.length;
    const startIndex = Math.max(windowSize, total - rangeCount);
    const state = buildState(startIndex, windowSize);
    const add = (d, sign) => { d.first.forEach((x) => { state.count[x] += sign; }); state.count2[d.second] += sign; };
    const random = seededRandom(20080124);
    const results = METHODS.map(() => ({ matches: 0, three: 0, second: 0, wins: 0 }));
    for (let i = startIndex; i < total; i++) {
      const draw = allDraws[i];
      makePicks(state, allDraws[i - 1], random, n1, n2).forEach(([first, second], m) => {
        const k = first.filter((x) => draw.first.includes(x)).length;
        const hitSecond = second.includes(draw.second);
        const res = results[m];
        // 包牌時最佳的一注對中 min(k, 6) 個；第二區任一個對中即可。
        res.matches += k; res.three += k >= 3; res.second += hitSecond; res.wins += isWin(Math.min(k, 6), hitSecond);
      });
      add(draw, 1);
      add(allDraws[i - windowSize], -1);
      draw.first.forEach((x) => { state.lastSeen[x] = i; });
      state.lastSeen2[draw.second] = i;
    }
    return { tested: Math.max(0, total - startIndex), startIndex, results };
  }

  // ---- 8 + 2 推薦號碼 ----
  const WHEEL_BETS = binomial(8, 6) * 2;
  const wheelTheory = (() => {
    let three = 0, win = 0;
    for (let k = 0; k <= 6; k++) {
      const pk = binomial(8, k) * binomial(30, 6 - k) / binomial(38, 6);
      if (k >= 3) three += pk;
      win += pk * ((isWin(k, true) ? 2 / 8 : 0) + (isWin(k, false) ? 6 / 8 : 0));
    }
    return { avg: 6 * 8 / 38, three, second: 2 / 8, win };
  })();

  // 威力彩每週一、四開獎；遇國定假日可能調整，因此只標示「預計」。
  function nextDrawDate(dateText) {
    const date = new Date(`${dateText}T00:00:00Z`);
    do date.setUTCDate(date.getUTCDate() + 1); while (![1, 4].includes(date.getUTCDay()));
    return date.toISOString().slice(0, 10);
  }

  function renderPicks() {
    const latest = allDraws[allDraws.length - 1];
    const state = buildState(allDraws.length, backtestWindow);
    const picks = makePicks(state, latest, seededRandom(latest.period), 8, 2);
    const reasons = [
      (f, s) => `前 ${backtestWindow} 期出現 ${f.map((x) => state.count[x]).sort((a, b) => a - b).filter((_, i, a) => i === 0 || i === a.length - 1).join('–')} 次；第二區 ${s.map((x) => `${x}（${state.count2[x]} 次）`).join('、')}`,
      (f, s) => `前 ${backtestWindow} 期出現 ${f.map((x) => state.count[x]).sort((a, b) => a - b).filter((_, i, a) => i === 0 || i === a.length - 1).join('–')} 次；第二區 ${s.map((x) => `${x}（${state.count2[x]} 次）`).join('、')}`,
      (f, s) => `已連續 ${f.map((x) => allDraws.length - 1 - state.lastSeen[x]).sort((a, b) => a - b).filter((_, i, a) => i === 0 || i === a.length - 1).join('–')} 期未開；第二區 ${s.map((x) => `${x}（${allDraws.length - 1 - state.lastSeen2[x]} 期）`).join('、')}`,
      () => `上期 6 個號碼，再補前 ${backtestWindow} 期最熱門的 2 個`,
      () => `以最新期別為亂數種子，同一期內結果固定`,
    ];
    const { tested, results } = backtest(allDraws.length, backtestWindow, 8, 2);
    $('#picks-caption').textContent = `依據至 ${latest.date}（第 ${latest.period} 期）的開獎資料，供下一期（預計 ${nextDrawDate(latest.date)} 開獎）參考；開獎資料更新後自動重算。參考期數與上方「選號方法回測」相同（目前前 ${backtestWindow} 期）。`;
    const list = $('#picks-list');
    list.replaceChildren(...METHODS.map((m, i) => {
      const [first, second] = picks[i];
      const row = el('div', { class: 'pick-row' });
      const head = el('div', { class: 'pick-head' });
      head.append(el('strong', {}, m.name), el('span', { class: 'muted small' }, reasons[i](first, second)));
      const sorted = [...first].sort((a, b) => a - b);
      const ballsWrap = el('span', { class: 'balls' });
      sorted.forEach((n) => ballsWrap.append(el('span', { class: 'ball sm', 'aria-label': `第一區 ${n}` }, pad(n))));
      [...second].sort((a, b) => a - b).forEach((n, k) => ballsWrap.append(el('span', { class: `ball second sm${k ? ' joined' : ''}`, 'aria-label': `第二區 ${n}` }, String(n))));
      const r = results[i];
      const stat = el('span', { class: 'pick-stat small' }, tested ? `回測中任一獎項 ${pct(r.wins / tested, 2)}` : '');
      row.append(head, ballsWrap, stat);
      return row;
    }));
    $('#picks-odds').textContent = `8 + 2 全包需 ${WHEEL_BETS} 注（${fmt(WHEEL_BETS * 100)} 元）。任何一組 8 + 2 號碼的機率都相同：頭獎約 1／${fmt(Math.round(ALL_COMBOS / WHEEL_BETS))}，中任一獎項 ${pct(wheelTheory.win, 2)}（回測共 ${fmt(tested)} 期，各方法都在理論值附近）。多數中獎是 100–200 元的小獎，長期平均拿回的錢少於投入。本區塊僅為統計示範，不代表下一期較可能開出這些號碼；未滿 18 歲不得購買彩券。`;
  }

  function renderBacktest(rangeCount) {
    const { tested, startIndex, results } = backtest(rangeCount, backtestWindow);
    const caption = $('#backtest-caption');
    if (tested < 20) {
      caption.textContent = '測試期數太少，請選擇較大的統計範圍。';
      ['#chart-backtest', '#backtest-table'].forEach((sel) => $(sel).replaceChildren());
      $('#backtest-summary').hidden = true;
      return;
    }
    $('#backtest-summary').hidden = false;
    caption.textContent = `共測試 ${fmt(tested)} 期（${allDraws[startIndex].date} ～ ${allDraws[allDraws.length - 1].date}）。灰色帶為純隨機下約 95% 會落入的範圍（理論值 ± 2 個標準誤），點落在帶內代表與隨便選沒有差別。`;
    const seWin = Math.sqrt(P_WIN * (1 - P_WIN) / tested);
    const seMatch = Math.sqrt(MATCH_VAR / tested);
    const rows = METHODS.map((m, i) => {
      const r = results[i];
      return { ...m, avg: r.matches / tested, three: r.three / tested, second: r.second / tested, win: r.wins / tested };
    });
    dotChart($('#chart-backtest'), rows, P_WIN, seWin);

    const p3 = [3, 4, 5, 6].reduce((a, k) => a + binomial(6, k) * binomial(32, 6 - k), 0) / binomial(38, 6);
    const verdict = (z) => (Math.abs(z) <= 2 ? { text: '與隨機無差別', badge: 'verdict ok' } : { text: '超出隨機誤差', badge: 'verdict off' });
    const body = rows.map((d) => [d.name, { text: d.desc.replace('N', backtestWindow), className: 'wrap' }, d.avg.toFixed(3), pct(d.three, 2), pct(d.second), pct(d.win, 2),
      verdict(Math.max(Math.abs((d.win - P_WIN) / seWin), Math.abs((d.avg - 36 / 38) / seMatch)))]);
    const theory = ['理論值', { text: '任何選號方法都一樣', className: 'wrap' }, (36 / 38).toFixed(3), pct(p3, 2), '12.5%', pct(P_WIN, 2), '—'];
    theory.rowClass = 'total';
    table($('#backtest-table'), ['方法', { text: '選號方式', className: 'wrap' }, '第一區平均對中', '對中 3 個以上', '第二區命中', '中任一獎項', '判讀'], [...body, theory]);

    const best = [...rows].sort((a, b) => b.win - a.win)[0];
    const allOk = rows.every((d) => Math.abs(d.win - P_WIN) <= 2 * seWin && Math.abs(d.avg - 36 / 38) <= 2 * seMatch);
    $('#backtest-summary').textContent = allOk
      ? `結論：五種方法的結果都在隨機誤差範圍內。這次「${best.name}」中獎率最高（${pct(best.win, 2)}），但換個參考期數或統計範圍，排名就會改變——這正是隨機波動的特徵。預測網站的熱門號、冷門號、遺漏期數，都不會讓中獎機會變高。`
      : `結論：有方法超出 2 個標準誤，但同時比較多種方法時，偶爾超出是預期中的巧合（約每 20 次比較就會出現 1 次）；換個參考期數或統計範圍通常就會消失。開獎是獨立隨機事件，任何選號方法的理論機率都相同。`;
  }

  function dotChart(container, rows, center, se) {
    container.replaceChildren();
    const width = Math.max(320, container.clientWidth || 640);
    const rowH = 38;
    const m = { top: 10, right: 16, bottom: 30, left: 84 };
    const height = m.top + rows.length * rowH + m.bottom;
    const lo = center - 2 * se;
    const hi = center + 2 * se;
    const values = rows.map((d) => d.win);
    let min = Math.min(lo, ...values);
    let max = Math.max(hi, ...values);
    const padding = (max - min) * 0.15;
    min -= padding; max += padding;
    const w = width - m.left - m.right;
    const x = (v) => m.left + ((v - min) / (max - min)) * w;
    const svg = el('svg:svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '各選號方法中任一獎項比例與隨機誤差範圍' });
    const step = niceStep((max - min) / 4);
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
      svg.append(el('svg:line', { class: 'grid', x1: x(v), x2: x(v), y1: m.top, y2: height - m.bottom }));
      svg.append(el('svg:text', { x: x(v), y: height - 10, 'text-anchor': 'middle' }, `${(v * 100).toFixed(step < 0.001 ? 2 : 1)}%`));
    }
    svg.append(el('svg:rect', { class: 'band', x: x(lo), y: m.top, width: x(hi) - x(lo), height: rows.length * rowH }));
    svg.append(el('svg:line', { class: 'ref', x1: x(center), x2: x(center), y1: m.top, y2: m.top + rows.length * rowH }));
    rows.forEach((d, i) => {
      const cy = m.top + i * rowH + rowH / 2;
      svg.append(el('svg:text', { class: 'row-label', x: m.left - 10, y: cy + 4, 'text-anchor': 'end' }, d.name));
      const dot = el('svg:circle', { class: 'dot', cx: x(d.win), cy, r: 6 });
      const hit = el('svg:rect', { class: 'hit', x: m.left, y: cy - rowH / 2, width: w, height: rowH, tabindex: '0',
        'aria-label': `${d.name}：中任一獎項 ${pct(d.win, 2)}，理論 ${pct(center, 2)}` });
      const enter = (event) => {
        dot.classList.add('active');
        const box = dot.getBoundingClientRect();
        showTip(`<b>${d.name}</b><br>中任一獎項 ${pct(d.win, 2)}（理論 ${pct(center, 2)}）<br>第一區平均對中 ${d.avg.toFixed(3)} 個<br>第二區命中 ${pct(d.second)}`,
          event.clientX ?? box.left + box.width / 2, event.clientY ?? box.top);
      };
      const leave = () => { dot.classList.remove('active'); hideTip(); };
      hit.addEventListener('pointermove', enter);
      hit.addEventListener('pointerleave', leave);
      hit.addEventListener('focus', () => enter({}));
      hit.addEventListener('blur', leave);
      svg.append(dot, hit);
    });
    container.append(svg);
  }

  document.querySelectorAll('[data-window]').forEach((button) => {
    button.addEventListener('click', () => {
      backtestWindow = Number(button.dataset.window);
      document.querySelectorAll('[data-window]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      if (allDraws.length) { renderBacktest(current === 'all' ? allDraws.length : Number(current)); renderPicks(); }
    });
  });

  function renderStatic(data) {
    const latest = allDraws[allDraws.length - 1];
    $('#latest-period').textContent = `第 ${latest.period} 期`;
    $('#latest-balls').replaceWith(Object.assign(balls(latest.first, latest.second), { id: 'latest-balls' }));
    $('#latest-date').textContent = `${latest.date} 開獎；右側實心為第二區`;
    $('#updated').textContent = data.updated;

    const t = el('table');
    const head = el('tr');
    ['期別', '開獎日', '第一區（由小到大）＋第二區', '第一區總和'].forEach((h) => head.append(el('th', {}, h)));
    const thead = el('thead');
    thead.append(head);
    t.append(thead);
    const body = el('tbody');
    allDraws.slice(-20).reverse().forEach((d) => {
      const tr = el('tr');
      const cell = el('td');
      cell.append(balls(d.first, d.second, true));
      tr.append(el('td', {}, String(d.period)), el('td', {}, d.date), cell, el('td', { class: 'sum-cell' }, String(sumOf(d))));
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
      renderPicks();
      window.dispatchEvent(new Event('lottery:loaded'));
    })
    .catch((error) => {
      const status = $('#status');
      status.textContent = navigator.onLine
        ? `開獎資料載入失敗：${error.message}。請重新整理頁面。`
        : '目前離線，且尚未下載過開獎資料；請連線後再開啟一次，之後即可離線查看。';
      status.classList.add('error');
    });
})();
