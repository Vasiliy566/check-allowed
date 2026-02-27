/**
 * Диагностика доступности сайтов — только статический фронт.
 * Проверка через загрузку <img> (favicon / apple-touch-icon), без fetch/CORS.
 */

(function () {
  'use strict';

  // --- Конфигурация ---
  const PROBE_TIMEOUT_MS = 6000;
  const CONCURRENCY = 15;
  const DEFAULT_LIMIT = 120;

  // Контрольные домены для диагностики "интернет / DNS / GitHub"
  const CONTROL_DOMAINS = [
    { name: 'example.com', url: 'https://example.com/favicon.ico' },
    { name: 'www.google.com', url: 'https://www.google.com/favicon.ico' },
    { name: 'raw.githubusercontent.com', url: 'https://raw.githubusercontent.com/favicon.ico' }
  ];

  // Источники списков: id -> raw URL (allow-domains)
  const DOMAIN_SOURCES = {
    'russia-inside': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Russia/inside-raw.lst',
    'russia-outside': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Russia/outside-raw.lst',
    'discord': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/discord.lst',
    'youtube': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/youtube.lst',
    'meta': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/meta.lst',
    'telegram': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/telegram.lst',
    'tiktok': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/tiktok.lst',
    'twitter': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/twitter.lst',
    'hdrezka': 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/hdrezka.lst'
  };

  // Пробы для каждого домена: сначала favicon, при неудаче — apple-touch-icon (оба загружаются как img)
  const PROBE_URLS = ['/favicon.ico', '/apple-touch-icon.png'];

  // --- Состояние ---
  let state = {
    results: [],
    rknSnapshot: null,
    runId: 0,
    stopped: false,
    startTime: null
  };

  // --- DOM ---
  const el = {
    domainSource: document.getElementById('domain-source'),
    domainLimit: document.getElementById('domain-limit'),
    limitWarning: document.getElementById('limit-warning'),
    healthThreshold: document.getElementById('health-threshold'),
    statusBadge: document.getElementById('status-badge'),
    statusDetail: document.getElementById('status-detail'),
    metrics: document.getElementById('metrics'),
    metricTotal: document.getElementById('metric-total'),
    metricOk: document.getElementById('metric-ok'),
    metricFail: document.getElementById('metric-fail'),
    metricTimeout: document.getElementById('metric-timeout'),
    metricDuration: document.getElementById('metric-duration'),
    progressWrap: document.getElementById('progress-wrap'),
    progress: document.getElementById('progress'),
    progressLabel: document.getElementById('progress-label'),
    btnRun: document.getElementById('btn-run'),
    btnStop: document.getElementById('btn-stop'),
    btnRetryFailed: document.getElementById('btn-retry-failed'),
    btnExport: document.getElementById('btn-export'),
    tableSearch: document.getElementById('table-search'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    resultsTbody: document.getElementById('results-tbody'),
    rknColHeader: document.getElementById('rkn-col-header'),
    rknStatus: document.getElementById('rkn-status')
  };

  // --- Парсинг списков доменов ---
  function parseDomainList(text) {
    const lines = (text || '').split(/\r?\n/);
    const domains = new Set();
    for (const line of lines) {
      const s = line.replace(/#.*$/, '').trim().toLowerCase();
      if (!s) continue;
      // Убрать префиксы типа "server=" или "domain=" если есть
      const domain = s.replace(/^(server=|domain=)/i, '').trim();
      if (domain && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain)) {
        domains.add(domain);
      }
    }
    return Array.from(domains);
  }

  function getDefaultDomainsPath() {
    const base = document.querySelector('base')?.href || (window.location.pathname.replace(/\/[^/]*$/, '') || '/');
    return (base.replace(/\/$/, '') + '/data/default_domains.txt').replace(/\/\/+/g, '/');
  }

  function getRknSnapshotPath() {
    const base = document.querySelector('base')?.href || (window.location.pathname.replace(/\/[^/]*$/, '') || '/');
    return (base.replace(/\/$/, '') + '/data/rkn_snapshot.json').replace(/\/\/+/g, '/');
  }

  /** Загрузить текст по URL (только для same-origin или CORS-разрешённых; GitHub raw отдаёт CORS) */
  function fetchText(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  /** Загрузить домены из выбранного источника или fallback */
  function loadDomainsForRun() {
    const sourceId = el.domainSource.value;
    const url = DOMAIN_SOURCES[sourceId];
    if (!url) return Promise.resolve(parseDomainList(''));

    return fetchText(url).then(
      function (text) {
        return parseDomainList(text);
      },
      function () {
        return fetchText(getDefaultDomainsPath()).then(
          function (text) { return parseDomainList(text); },
          function () { return []; }
        );
      }
    );
  }

  /** Загрузить RKN snapshot если есть */
  function loadRknSnapshot() {
    return fetch(getRknSnapshotPath(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('no snapshot');
        return r.json();
      })
      .then(function (data) {
        state.rknSnapshot = data && typeof data.domains === 'object' ? data.domains : null;
        if (state.rknSnapshot) {
          el.rknStatus.textContent = 'Снапшот РКН загружен. Колонка «RKN» заполнена по данным снапшота.';
        } else {
          el.rknStatus.textContent = 'Снапшот РКН не найден или пуст. В колонке «RKN» отображается unknown.';
        }
      })
      .catch(function () {
        state.rknSnapshot = null;
        el.rknStatus.textContent = 'Файл data/rkn_snapshot.json отсутствует. Официальный дамп РКН через GitHub Pages недоступен — см. README.';
      });
  }

  // --- Проверка доступности через <img> ---
  function probeOne(domain, probePath, runId) {
    return new Promise(function (resolve) {
      const url = 'https://' + domain + probePath + '?cb=' + Math.random().toString(36).slice(2);
      const img = new Image();
      const start = Date.now();
      let settled = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(tid);
        img.onload = img.onerror = null;
        img.src = '';
        resolve({ result: result, latency: Date.now() - start, probe: probePath });
      }

      const tid = setTimeout(function () {
        finish('timeout');
      }, PROBE_TIMEOUT_MS);

      img.onload = function () { finish('ok'); };
      img.onerror = function () { finish('fail'); };
      img.src = url;
    });
  }

  /** Проверить домен: сначала favicon, при fail/timeout — apple-touch-icon */
  function probeDomain(domain, runId) {
    function tryNext(index) {
      if (index >= PROBE_URLS.length) {
        return Promise.resolve({ status: 'timeout', probe: PROBE_URLS[0], latency: PROBE_TIMEOUT_MS });
      }
      return probeOne(domain, PROBE_URLS[index], runId).then(function (r) {
        if (r.result === 'ok') return { status: 'ok', probe: r.probe, latency: r.latency };
        if (r.result === 'fail' && index < PROBE_URLS.length - 1) return tryNext(index + 1);
        return { status: r.result === 'timeout' ? 'timeout' : 'fail', probe: r.probe, latency: r.latency };
      });
    }
    return tryNext(0);
  }

  /** Контрольная проверка одного URL (для example.com, google, raw.githubusercontent) */
  function probeControl(url, runId) {
    return new Promise(function (resolve) {
      const start = Date.now();
      const img = new Image();
      let settled = false;
      const tid = setTimeout(function () {
        if (settled) return;
        settled = true;
        img.onload = img.onerror = null;
        img.src = '';
        resolve({ ok: false, latency: PROBE_TIMEOUT_MS });
      }, PROBE_TIMEOUT_MS);
      img.onload = function () {
        if (settled) return;
        settled = true;
        clearTimeout(tid);
        img.onload = img.onerror = null;
        img.src = '';
        resolve({ ok: true, latency: Date.now() - start });
      };
      img.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(tid);
        img.onload = img.onerror = null;
        img.src = '';
        resolve({ ok: false, latency: Date.now() - start });
      };
      img.src = url + '?cb=' + Math.random().toString(36).slice(2);
    });
  }

  // --- Пул выполнения: не более concurrency задач одновременно ---
  function runPool(tasks, concurrency, runId) {
    let index = 0;
    let inFlight = 0;

    function next() {
      if (state.stopped || runId !== state.runId) return;
      while (index < tasks.length && inFlight < concurrency) {
        const i = index++;
        inFlight++;
        tasks[i]().then(
          function () { inFlight--; next(); },
          function () { inFlight--; next(); }
        );
      }
    }

    next();
  }

  // --- Основной сценарий проверки ---
  function updateProgress(done, total) {
    el.progress.value = total ? Math.round((done / total) * 100) : 0;
    el.progressLabel.textContent = done + ' / ' + total;
  }

  function setBadge(className, icon, text, detail) {
    el.statusBadge.className = 'status-badge ' + className;
    el.statusBadge.querySelector('.badge-icon').textContent = icon;
    el.statusBadge.querySelector('.badge-text').textContent = text;
    el.statusDetail.textContent = detail || '';
  }

  function runCheck() {
    state.stopped = false;
    state.runId = (state.runId || 0) + 1;
    const runId = state.runId;
    state.results = [];
    state.startTime = Date.now();

    el.btnRun.disabled = true;
    el.btnStop.disabled = false;
    el.btnRetryFailed.disabled = true;
    el.btnExport.disabled = true;
    el.progressWrap.hidden = false;
    setBadge('running', '…', 'Проверка...', 'Контрольные домены...');

    const limit = Math.max(1, parseInt(el.domainLimit.value, 10) || DEFAULT_LIMIT);

    // 1) Контрольные проверки
    Promise.all(CONTROL_DOMAINS.map(function (c) {
      return probeControl(c.url, runId).then(function (r) {
        return { name: c.name, ok: r.ok, latency: r.latency };
      });
    })).then(function (controls) {
      if (runId !== state.runId || state.stopped) return;

      const exampleOk = controls[0] && controls[0].ok;
      const rawOk = controls[2] && controls[2].ok;

      if (!exampleOk) {
        var detail = 'Контрольный example.com недоступен. ';
        if (window.location.hostname.indexOf('github.io') !== -1) {
          detail += 'На GitHub Pages загрузка внешних изображений может блокироваться. Разверните сайт на Netlify/Cloudflare Pages или откройте index.html локально (например: python3 -m http.server 8080).';
        }
        setBadge('fail', '❌', 'Похоже, нет интернета или сломался DNS', detail);
        el.btnRun.disabled = false;
        el.btnStop.disabled = true;
        el.progressWrap.hidden = true;
        return;
      }

      if (!rawOk) {
        setBadge('partial', '⚠️', 'GitHub недоступен', 'Списки доменов не загрузить. Используется встроенный минимальный список.');
      }

      return loadDomainsForRun().then(function (domains) {
        if (runId !== state.runId || state.stopped) return;
        const limited = domains.slice(0, limit);
        if (limited.length === 0) {
          setBadge('partial', '⚠️', 'Нет доменов для проверки', 'Загрузите список или выберите другой источник.');
          el.btnRun.disabled = false;
          el.btnStop.disabled = true;
          el.progressWrap.hidden = true;
          return;
        }

        setBadge('running', '…', 'Проверка доменов...', '');
        const threshold = parseInt(el.healthThreshold.value, 10) || 85;
        const total = limited.length;
        let done = 0;
        const resultMap = {};
        const order = [];

        const tasks = limited.map(function (domain) {
          return function () {
            return probeDomain(domain, runId).then(function (r) {
              if (runId !== state.runId) return;
              resultMap[domain] = {
                domain: domain,
                status: r.status,
                probe: r.probe,
                latency: r.latency,
                timestamp: new Date().toISOString(),
                rkn: state.rknSnapshot && state.rknSnapshot[domain] !== undefined
                  ? (state.rknSnapshot[domain] ? 'yes' : 'no')
                  : 'unknown'
              };
              order.push(domain);
              done++;
              updateProgress(done, total);
              renderTable();
              return r;
            });
          };
        });

        const results = runPool(tasks, CONCURRENCY, runId);
        // Ждём завершения по таймеру (все задачи пишут в resultMap и order)
        function waitDone() {
          if (done >= total || state.stopped || runId !== state.runId) {
            finishRun(runId, order, resultMap, threshold);
            return;
          }
          setTimeout(waitDone, 200);
        }
        waitDone();
      });
    });
  }

  function finishRun(runId, order, resultMap, threshold) {
    if (runId !== state.runId) return;

    state.results = order.map(function (d) { return resultMap[d]; }).filter(Boolean);
    const ok = state.results.filter(function (r) { return r.status === 'ok'; }).length;
    const fail = state.results.filter(function (r) { return r.status === 'fail'; }).length;
    const timeout = state.results.filter(function (r) { return r.status === 'timeout'; }).length;
    const total = state.results.length;
    const duration = state.startTime ? ((Date.now() - state.startTime) / 1000).toFixed(1) + ' с' : '—';
    const pct = total ? Math.round((ok / total) * 100) : 0;

    el.metricTotal.textContent = total;
    el.metricOk.textContent = ok;
    el.metricFail.textContent = fail;
    el.metricTimeout.textContent = timeout;
    el.metricDuration.textContent = duration;
    el.progressWrap.hidden = true;
    el.btnRun.disabled = false;
    el.btnStop.disabled = true;
    el.btnRetryFailed.disabled = (fail + timeout) === 0;
    el.btnExport.disabled = false;

    if (pct >= threshold) {
      setBadge('ok', '✅', 'Всё ок', 'Интернет есть, доля доступных доменов ' + pct + '% (порог ' + threshold + '%).');
    } else if (pct > 0) {
      setBadge('partial', '⚠️', 'Частично не ок', 'Часть доменов недоступна (OK: ' + pct + '%). Возможны блокировки.');
    } else {
      setBadge('fail', '❌', 'Не ок', 'Массовые сбои при том что контрольный example.com доступен. Возможны блокировки или проблемы сети.');
    }
    renderTable();
  }

  function stopCheck() {
    state.stopped = true;
  }

  function retryFailed() {
    const failed = state.results.filter(function (r) { return r.status === 'fail' || r.status === 'timeout'; });
    if (failed.length === 0) return;
    state.stopped = false;
    state.runId++;
    const runId = state.runId;
    state.startTime = Date.now();
    el.btnRun.disabled = true;
    el.btnStop.disabled = false;
    el.btnRetryFailed.disabled = true;
    el.progressWrap.hidden = false;
    setBadge('running', '…', 'Повтор упавших...', '');
    const total = failed.length;
    let done = 0;
    const resultMap = {};
    state.results.forEach(function (r) { resultMap[r.domain] = r; });
    const order = state.results.map(function (r) { return r.domain; });

    const tasks = failed.map(function (r) {
      return function () {
        return probeDomain(r.domain, runId).then(function (res) {
          if (runId !== state.runId) return;
          resultMap[r.domain] = {
            domain: r.domain,
            status: res.status,
            probe: res.probe,
            latency: res.latency,
            timestamp: new Date().toISOString(),
            rkn: state.rknSnapshot && state.rknSnapshot[r.domain] !== undefined
              ? (state.rknSnapshot[r.domain] ? 'yes' : 'no')
              : 'unknown'
          };
          done++;
          updateProgress(done, total);
          renderTable();
          return res;
        });
      };
    });

    runPool(tasks, CONCURRENCY, runId);
    function waitDone() {
      if (done >= total || state.stopped || runId !== state.runId) {
        finishRun(runId, order, resultMap, parseInt(el.healthThreshold.value, 10) || 85);
        return;
      }
      setTimeout(waitDone, 200);
    }
    waitDone();
  }

  // --- Таблица и фильтры ---
  function getCurrentFilter() {
    const active = document.querySelector('.filter-btn.active');
    return active ? active.dataset.filter : 'all';
  }

  function renderTable() {
    const search = (el.tableSearch.value || '').trim().toLowerCase();
    const filter = getCurrentFilter();
    let rows = state.results;
    if (filter !== 'all') rows = rows.filter(function (r) { return r.status === filter; });
    if (search) rows = rows.filter(function (r) { return r.domain.indexOf(search) !== -1; });

    el.resultsTbody.innerHTML = rows.map(function (r) {
      const rknVal = (r.rkn !== undefined) ? r.rkn : 'unknown';
      const timeStr = r.timestamp ? r.timestamp.replace('T', ' ').slice(0, 19) : '—';
      return '<tr>' +
        '<td>' + escapeHtml(r.domain) + '</td>' +
        '<td class="status-' + r.status + '">' + r.status.toUpperCase() + '</td>' +
        '<td>' + escapeHtml(r.probe) + '</td>' +
        '<td>' + (r.latency != null ? r.latency : '—') + '</td>' +
        '<td>' + escapeHtml(timeStr) + '</td>' +
        '<td class="rkn-' + rknVal + '">' + rknVal + '</td>' +
        '</tr>';
    }).join('');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function exportJson() {
    const data = {
      timestamp: new Date().toISOString(),
      duration: el.metricDuration.textContent,
      total: state.results.length,
      results: state.results
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'availability-results-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // --- Предупреждение лимита ---
  function updateLimitWarning() {
    const v = el.domainLimit.value;
    if (v === '300') {
      el.limitWarning.textContent = '300 запросов могут быть долгими и создавать нагрузку.';
    } else {
      el.limitWarning.textContent = '';
    }
  }

  // --- Инициализация ---
  el.domainLimit.addEventListener('change', updateLimitWarning);
  updateLimitWarning();

  el.btnRun.addEventListener('click', runCheck);
  el.btnStop.addEventListener('click', stopCheck);
  el.btnRetryFailed.addEventListener('click', retryFailed);
  el.btnExport.addEventListener('click', exportJson);

  el.tableSearch.addEventListener('input', renderTable);
  el.filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      el.filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderTable();
    });
  });

  loadRknSnapshot().then(function () {
    renderTable();
  });
})();
