/* global require, CSInterface */
(function () {
  var fs = require('fs');
  var os = require('os');
  var path = require('path');
  var status = document.getElementById('status');
  var result = document.getElementById('result');
  var addCaptions = document.getElementById('add-captions');
  var exportSrt = document.getElementById('export-srt');
  var sequenceName = document.getElementById('sequence-name');
  var progressFill = document.getElementById('progress-fill');
  var progressText = document.getElementById('progress-text');
  var progressArea = document.getElementById('progress-area');
  var serverDot = document.getElementById('server-dot');
  var versionEl = document.getElementById('version');
  var csInterface = new CSInterface();
  var srtPath = '';
  var baseDir = path.join(os.tmpdir(), 'PRSubtitleRecognizer');
  var CONFIG_FILE = path.join(baseDir, 'config.json');
  var HISTORY_FILE = path.join(baseDir, 'history.json');

  // ── Helpers ──────────────────────────────────
  function setProgress(pct) {
    pct = Math.max(0, Math.min(100, pct));
    progressFill.style.width = pct + '%';
    progressText.textContent = Math.round(pct) + '%';
  }
  function setStatus(msg, isError) {
    status.textContent = msg;
    status.className = isError ? 'error' : (msg.indexOf('完成') >= 0 ? 'success' : '');
  }
  function evalHost(s) { return new Promise(function (r) { csInterface.evalScript(s, r); }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── Init ────────────────────────────────────
  evalHost('prSubtitlePluginVersion()').then(function (v) {
    if (v) versionEl.textContent = 'v' + v;
    serverDot.className = 'dot on';
    serverDot.title = 'Premiere 已连接';
  }).catch(function () {});

  function checkServer() {
    fetch('http://127.0.0.1:8765/health')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        serverDot.className = 'dot on';
        serverDot.title = '服务正常 (' + d.device.toUpperCase() + ')';
      })
      .catch(function () { serverDot.className = 'dot off'; serverDot.title = '服务未启动'; });
  }
  checkServer(); setInterval(checkServer, 10000);

  // ── Config persistence ──────────────────────
  function loadJSON(f) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) {} return null; }
  function saveJSON(f, o) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2), 'utf8'); } catch (_) {} }
  function loadConfig() { return loadJSON(CONFIG_FILE) || {}; }
  function saveConfig(o) { saveJSON(CONFIG_FILE, o); }

  // ── Provider switch ──────────────────────────
  var providerEl = document.getElementById('provider');
  var apiOptions = document.getElementById('api-options');
  var localOptions = document.getElementById('local-options');
  var apiBaseEl = document.getElementById('api-base');
  var apiKeyEl = document.getElementById('api-key');
  var apiModelEl = document.getElementById('api-model');

  function toggleProvider() {
    var isApi = providerEl.value === 'openai';
    localOptions.style.display = isApi ? 'none' : '';
    apiOptions.style.display = isApi ? '' : 'none';
  }
  (function () {
    var cfg = loadConfig();
    if (cfg.provider) providerEl.value = cfg.provider;
    if (cfg.apiBase) apiBaseEl.value = cfg.apiBase;
    if (cfg.apiKey) apiKeyEl.value = cfg.apiKey;
    if (cfg.apiModel) apiModelEl.value = cfg.apiModel;
    toggleProvider();
  })();
  providerEl.addEventListener('change', function () { toggleProvider(); var c = loadConfig(); c.provider = providerEl.value; saveConfig(c); });
  [apiBaseEl, apiKeyEl, apiModelEl].forEach(function (el) {
    el.addEventListener('change', function () { var c = loadConfig(); c.apiBase = apiBaseEl.value; c.apiKey = apiKeyEl.value; c.apiModel = apiModelEl.value; saveConfig(c); });
  });

  // ── Translate config (independent from recognition) ──
  var tlBaseEl = document.getElementById('translate-api-base');
  var tlKeyEl = document.getElementById('translate-api-key');
  var tlModelEl = document.getElementById('translate-model');
  var tlModelPresetEl = document.getElementById('translate-model-preset');
  var tlApiPresetEl = document.getElementById('translate-api-preset');
  var tlConfigDiv = document.getElementById('translate-config');
  var tlReadyDiv = document.getElementById('translate-ready');
  var tlStatusText = document.getElementById('translate-status-text');

  // API presets
  var API_PRESETS = {
    DeepSeek:    'https://api.deepseek.com/v1',
    OpenAI:      'https://api.openai.com/v1',
    Groq:        'https://api.groq.com/openai/v1',
    SiliconFlow: 'https://api.siliconflow.cn/v1',
  };

  // Load saved config
  (function () {
    var cfg = loadConfig();
    // Find preset match
    var preset = '';
    Object.keys(API_PRESETS).forEach(function (k) {
      if (API_PRESETS[k] === cfg.tlBase) preset = k;
    });
    tlApiPresetEl.value = preset;
    if (cfg.tlBase && !preset) tlBaseEl.value = cfg.tlBase;
    if (preset) tlBaseEl.value = API_PRESETS[preset];
    if (cfg.tlKey) tlKeyEl.value = cfg.tlKey;

    // Model: check if it matches a preset AND is compatible with the API
    var modelMatch = false;
    for (var i = 0; i < tlModelPresetEl.options.length; i++) {
      var opt = tlModelPresetEl.options[i];
      if (opt.value === cfg.tlModel && (!preset || opt.getAttribute('data-api') === preset)) {
        modelMatch = true; break;
      }
    }
    if (modelMatch) {
      tlModelPresetEl.value = cfg.tlModel;
      tlModelEl.style.display = 'none';
    } else if (cfg.tlModel) {
      // Saved model doesn't match current API → auto-pick first for this API
      var autoPicked = false;
      for (var j = 0; j < tlModelPresetEl.options.length; j++) {
        var o = tlModelPresetEl.options[j];
        if (preset && o.getAttribute('data-api') === preset) {
          tlModelPresetEl.value = o.value;
          tlModelEl.style.display = 'none';
          autoPicked = true; break;
        }
      }
      if (!autoPicked) {
        tlModelPresetEl.value = '';
        tlModelEl.value = cfg.tlModel;
        tlModelEl.style.display = '';
      }
    }

    // If fully configured, show ready mode
    if (cfg.tlKey) {
      showTranslateReady(cfg);
    } else {
      showTranslateConfig();
    }
  })();

  function getTranslateModel() {
    return tlModelPresetEl.value || tlModelEl.value;
  }

  function showTranslateConfig() {
    tlConfigDiv.style.display = '';
    tlReadyDiv.style.display = 'none';
  }
  function showTranslateReady(cfg) {
    tlConfigDiv.style.display = 'none';
    tlReadyDiv.style.display = '';
    var p = tlApiPresetEl.value || '自定义';
    var m = getTranslateModel();
    tlStatusText.textContent = p + ' / ' + m + ' 已配置';
  }

  // API preset → auto-fill address
  tlApiPresetEl.addEventListener('change', function () {
    if (this.value && API_PRESETS[this.value]) {
      tlBaseEl.value = API_PRESETS[this.value];
    }
    // Auto-select first matching model for this API
    var sel = this.value;
    for (var i = 0; i < tlModelPresetEl.options.length; i++) {
      var opt = tlModelPresetEl.options[i];
      if (sel && opt.getAttribute('data-api') === sel) {
        tlModelPresetEl.value = opt.value;
        tlModelEl.style.display = 'none';
        return;
      }
    }
  });

  // Model preset → toggle custom input
  tlModelPresetEl.addEventListener('change', function () {
    tlModelEl.style.display = this.value ? 'none' : '';
  });

  // Save config
  document.getElementById('translate-save').addEventListener('click', function () {
    if (!tlKeyEl.value) { setStatus('请输入 API Key。', true); return; }
    var c = loadConfig();
    c.tlBase = tlBaseEl.value;
    c.tlKey = tlKeyEl.value;
    c.tlModel = getTranslateModel();
    saveConfig(c);
    showTranslateReady(c);
    setStatus('翻译配置已保存。');
  });

  // Edit config
  document.getElementById('translate-edit').addEventListener('click', function (e) {
    e.preventDefault();
    showTranslateConfig();
  });

  // ── Presets ──────────────────────────────────
  var presetSelect = document.getElementById('preset-select');
  var presetFields = ['provider', 'range', 'language', 'model'].concat(
    providerEl.value === 'openai' ? ['api-base', 'api-key', 'api-model'] : []
  );

  function loadPresets() {
    var cfg = loadConfig();
    var list = cfg._presets || {};
    presetSelect.innerHTML = '<option value="">-- 加载预设 --</option>';
    Object.keys(list).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = k;
      presetSelect.appendChild(o);
    });
  }
  presetSelect.addEventListener('change', function () {
    if (!this.value) return;
    var cfg = loadConfig();
    var p = (cfg._presets || {})[this.value];
    if (!p) return;
    Object.keys(p).forEach(function (k) {
      var el = document.getElementById(k);
      if (el) { el.value = p[k]; el.dispatchEvent(new Event('change')); }
    });
    toggleProvider();
    setStatus('已加载预设：' + this.value);
  });

  document.getElementById('preset-save').addEventListener('click', function () {
    var name = prompt('预设名称：');
    if (!name) return;
    var cfg = loadConfig();
    if (!cfg._presets) cfg._presets = {};
    var p = {};
    ['provider', 'range', 'language', 'model', 'api-base', 'api-key', 'api-model'].forEach(function (k) {
      var el = document.getElementById(k);
      if (el && el.value) p[k] = el.value;
    });
    cfg._presets[name] = p;
    saveConfig(cfg);
    loadPresets();
    setStatus('已保存预设：' + name);
  });

  document.getElementById('preset-del').addEventListener('click', function () {
    var name = presetSelect.value;
    if (!name) return;
    var cfg = loadConfig();
    delete (cfg._presets || {})[name];
    saveConfig(cfg);
    loadPresets();
    setStatus('已删除预设：' + name);
  });
  loadPresets();

  // ── History ──────────────────────────────────
  var historySelect = document.getElementById('history-select');
  function loadHistory() {
    var h = loadJSON(HISTORY_FILE) || [];
    historySelect.innerHTML = '<option value="">-- 选择 --</option>';
    h.forEach(function (entry, i) {
      var o = document.createElement('option');
      o.value = i;
      var seq = entry.seqName || '(未知序列)';
      var prev = (entry.preview || '').substring(0, 25);
      o.textContent = entry.time + ' [' + seq + '] ' + prev;
      historySelect.appendChild(o);
    });
    document.getElementById('history-card').style.display = h.length ? '' : 'none';
  }
  function saveHistory() {
    var h = loadJSON(HISTORY_FILE) || [];
    var seq = sequenceName.textContent.replace('当前序列：', '');
    h.unshift({
      time: new Date().toLocaleString(),
      seqName: seq,
      preview: (result.value || '').substring(0, 60),
      text: result.value,
      srtPath: srtPath
    });
    if (h.length > 20) h.length = 20;
    saveJSON(HISTORY_FILE, h);
    loadHistory();
  }
  historySelect.addEventListener('change', function () {
    if (this.value === '') return;
    var h = loadJSON(HISTORY_FILE) || [];
    var entry = h[parseInt(this.value)];
    if (!entry) return;
    result.value = entry.text;
    srtPath = entry.srtPath;
    addCaptions.disabled = false;
    exportSrt.disabled = false;
    document.getElementById('translate-card').style.display = '';
    setStatus('已恢复历史记录：' + entry.time);
  });
  document.getElementById('history-clear').addEventListener('click', function () {
    saveJSON(HISTORY_FILE, []);
    loadHistory();
    setStatus('历史记录已清空。');
  });
  loadHistory();

  // ── Keyboard shortcuts ────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F5') { e.preventDefault(); document.getElementById('transcribe').click(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); document.getElementById('export-srt').click(); }
  });

  // ── Sequence auto-refresh ────────────────────
  async function refreshSequenceName() {
    var name = await evalHost('prSubtitleActiveSequenceName()');
    var display = name.indexOf('OK:') === 0 ? name.slice(3) : null;
    if (display) {
      var txt = '当前序列：' + display;
      if (sequenceName.textContent !== txt) {
        sequenceName.textContent = txt;
        sequenceName.className = 'changed';
        clearTimeout(sequenceName._t);
        sequenceName._t = setTimeout(function () { sequenceName.className = ''; }, 1500);
      }
    } else {
      sequenceName.textContent = name;
      sequenceName.className = '';
    }
  }

  // ── Find WAV preset ───────────────────────────
  function findWavePreset() {
    var adobe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Adobe');
    var vs = fs.readdirSync(adobe).filter(function (n) { return /^Adobe Premiere Pro/.test(n); }).sort().reverse();
    for (var i = 0; i < vs.length; i++) {
      var p = path.join(adobe, vs[i], 'Settings', 'EncoderPresets', 'Wave48mono16.epr');
      if (fs.existsSync(p)) return p;
    }
    throw new Error('未找到 Premiere WAV 导出预设。');
  }

  // ── Job poll ──────────────────────────────────
  async function waitForJob(jobId) {
    while (true) {
      var resp = await fetch('http://127.0.0.1:8765/jobs/' + jobId);
      if (!resp.ok) throw new Error('无法读取识别进度。');
      var job = await resp.json();
      setProgress(job.progress);
      setStatus(job.message + ' (' + job.progress + '%)', job.state === 'failed');
      if (job.state === 'completed') return job.result;
      if (job.state === 'failed') throw new Error(job.message);
      await wait(700);
    }
  }

  // ── Single sequence transcribe ────────────────
  async function transcribeOne(outputOverride) {
    var cache = path.join(baseDir, 'audio');
    fs.mkdirSync(cache, { recursive: true });
    var output = outputOverride || path.join(cache, 'seq-' + Date.now() + '.wav');
    var preset = findWavePreset();
    var rangeMode = document.getElementById('range').value;
    var labels = { all: '全部', work: '入出点', selected: '选中片段' };
    setStatus('正在导出（' + labels[rangeMode] + '）…');
    var exp = await evalHost('prSubtitleExportActiveSequence(' + JSON.stringify(output) + ',' + JSON.stringify(preset) + ',' + JSON.stringify(rangeMode) + ')');
    if (exp.indexOf('OK:') !== 0) throw new Error(exp);

    setStatus('正在创建识别任务…');
    var body = {
      media_path: output,
      language: document.getElementById('language').value,
      model: document.getElementById('model').value,
      provider: providerEl.value,
    };
    if (providerEl.value === 'openai') {
      body.api_base = apiBaseEl.value;
      body.api_key = apiKeyEl.value;
      body.api_model = apiModelEl.value;
    }
    var resp = await fetch('http://127.0.0.1:8765/transcribe-path', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || '服务请求失败');
    var job = await resp.json();
    result.value = await waitForJob(job.job_id);
    srtPath = output.replace(/\.wav$/i, '.srt');
    fs.writeFileSync(srtPath, result.value, { encoding: 'utf8' });

    // Import SRT into project panel
    var importMsg = await evalHost('prSubtitleImportSrt(' + JSON.stringify(srtPath) + ')');
    if (importMsg.indexOf('OK:') !== 0) throw new Error('导入项目面板失败：' + importMsg);

    addCaptions.disabled = false;
    exportSrt.disabled = false;
    document.getElementById('translate-card').style.display = '';
    saveHistory();
    setStatus('识别完成，SRT 已导入项目面板。');
  }

  // ── Batch mode checkbox ───────────────────────
  var batchModeEl = document.getElementById('batch-mode');
  var batchListEl = document.getElementById('batch-list');
  var batchSeqDiv = document.getElementById('batch-sequences');
  var batchCountEl = document.getElementById('batch-count');

  batchModeEl.addEventListener('change', function () {
    if (this.checked) {
      loadBatchList();
    } else {
      batchListEl.style.display = 'none';
    }
  });

  function loadBatchList() {
    evalHost('prSubtitleListSequences()').then(function (r) {
      if (r.indexOf('OK:') !== 0) { batchSeqDiv.innerHTML = '<span style="color:#f66">读取失败</span>'; return; }
      var seqs = JSON.parse(r.slice(3));
      var html = '';
      seqs.forEach(function (s) {
        html += '<label class="toggle" style="display:block;margin-bottom:3px"><input type="checkbox" class="batch-cb" value="' + s.replace(/"/g,'&quot;') + '" checked> ' + s + '</label>';
      });
      batchSeqDiv.innerHTML = html;
      batchListEl.style.display = '';
      updateBatchCount();
    });
  }

  function getCheckedSequences() {
    var cbs = document.querySelectorAll('.batch-cb:checked');
    return Array.prototype.map.call(cbs, function (cb) { return cb.value; });
  }

  function updateBatchCount() {
    var checked = getCheckedSequences().length;
    var total = document.querySelectorAll('.batch-cb').length;
    batchCountEl.textContent = checked + '/' + total + ' 已选';
  }

  batchSeqDiv.addEventListener('change', updateBatchCount);

  document.getElementById('batch-select-all').addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelectorAll('.batch-cb').forEach(function (cb) { cb.checked = true; });
    updateBatchCount();
  });
  document.getElementById('batch-deselect-all').addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelectorAll('.batch-cb').forEach(function (cb) { cb.checked = false; });
    updateBatchCount();
  });

  // ── Transcribe button ─────────────────────────
  document.getElementById('transcribe').addEventListener('click', async function () {
    result.value = ''; srtPath = ''; addCaptions.disabled = true; exportSrt.disabled = true;
    setProgress(0); progressArea.style.display = '';
    try {
      var batchMode = batchModeEl.checked;
      if (batchMode) {
        var seqs = getCheckedSequences();
        if (seqs.length === 0) throw new Error('请勾选至少一个序列。');
        setStatus('批量模式：共 ' + seqs.length + ' 个序列');

        try { await fetch('http://127.0.0.1:8765/health'); } catch (_) {
          throw new Error('服务未启动，请先双击 启动服务.bat。');
        }

        var allSrt = '';
        for (var i = 0; i < seqs.length; i++) {
          setStatus('批量 (' + (i + 1) + '/' + seqs.length + ')：' + seqs[i]);
          var act = await evalHost('prSubtitleActivateSequence(' + JSON.stringify(seqs[i]) + ')');
          if (act.indexOf('OK:') !== 0) { setStatus('跳过：' + act, true); continue; }
          await wait(800);

          var ok = false;
          for (var retry = 0; retry < 3; retry++) {
            try {
              await transcribeOne(path.join(baseDir, 'audio', 'batch-' + i + '.wav'));
              allSrt += result.value + '\n';
              ok = true; break;
            } catch (e) {
              if (retry < 2 && e.message === 'Failed to fetch') {
                setStatus('服务响应超时，重试 ' + (retry + 1) + '/2…');
                await wait(2000);
              } else { allSrt += '; ' + seqs[i] + ' 失败: ' + e.message + '\n'; break; }
            }
          }
        }
        result.value = allSrt;
        setStatus('批量完成：' + seqs.length + ' 个序列已处理。');
      } else {
        await transcribeOne(null);
      }
    } catch (err) {
      setStatus('任务失败：' + err.message, true);
      progressArea.style.display = 'none';
    }
  });

  // ── Add captions ─────────────────────────────
  addCaptions.addEventListener('click', async function () {
    var txt = result.value;
    if (!txt) return;
    // Write current textarea content to SRT file
    if (srtPath) fs.writeFileSync(srtPath, txt, { encoding: 'utf8' });
    setStatus('正在创建字幕轨道…');
    var msg = await evalHost('prSubtitleImportCaption(' + JSON.stringify(srtPath) + ')');
    setStatus(msg.indexOf('OK:') === 0 ? '字幕轨道创建成功。' : '创建失败：' + msg, msg.indexOf('OK:') !== 0);
  });

  // ── Export SRT ────────────────────────────────
  exportSrt.addEventListener('click', function () {
    var txt = result.value;
    if (!txt) return;
    var f = path.join(baseDir, 'export_' + Date.now() + '.srt');
    fs.writeFileSync(f, txt, { encoding: 'utf8' });
    setStatus('已导出到：' + f);
  });

  // ── Translate ──────────────────────────────────
  document.getElementById('translate-btn').addEventListener('click', async function () {
    var txt = result.value;
    if (!txt) return;
    var tlBase = document.getElementById('translate-api-base').value || 'https://api.openai.com/v1';
    var tlKey = document.getElementById('translate-api-key').value;
    if (!tlKey) { setStatus('翻译需要先配置 API Key。', true); return; }
    setStatus('正在翻译…');
    try {
      var resp = await fetch('http://127.0.0.1:8765/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: txt,
          target: document.getElementById('translate-target').value,
          api_base: tlBase,
          api_key: tlKey,
          model: getTranslateModel(),
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).detail);
      var data = await resp.json();
      result.value = data.text;
      if (srtPath) fs.writeFileSync(srtPath, data.text, { encoding: 'utf8' });
      saveHistory();
      setStatus('翻译完成。');
    } catch (e) { setStatus('翻译失败：' + e.message, true); }
  });

  // ── Start ─────────────────────────────────────
  refreshSequenceName();
  setInterval(refreshSequenceName, 2000);
}());
