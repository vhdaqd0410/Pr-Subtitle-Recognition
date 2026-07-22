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
  var CONFIG_FILE = path.join(os.tmpdir(), 'PRSubtitleRecognizer', 'config.json');

  function setProgress(pct) {
    pct = Math.max(0, Math.min(100, pct));
    progressFill.style.width = pct + '%';
    progressText.textContent = Math.round(pct) + '%';
  }
  function setStatus(msg, isError) {
    status.textContent = msg;
    status.className = isError ? 'error' : (msg.indexOf('完成') >= 0 ? 'success' : '');
  }
  function evalHost(script) { return new Promise(function (r) { csInterface.evalScript(script, r); }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── Version ──────────────────────────────────
  evalHost('prSubtitlePluginVersion()').then(function (v) {
    if (v) versionEl.textContent = 'v' + v;
    serverDot.className = 'dot on';
    serverDot.title = 'Premiere 已连接';
  }).catch(function () { /* ignore */ });

  // ── Server health check ──────────────────────
  function checkServer() {
    fetch('http://127.0.0.1:8765/health')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        serverDot.className = 'dot on';
        serverDot.title = '服务正常 (' + d.device.toUpperCase() + ')';
      })
      .catch(function () {
        serverDot.className = 'dot off';
        serverDot.title = '服务未启动';
      });
  }
  checkServer();
  setInterval(checkServer, 10000);

  // ── Settings persistence ─────────────────────
  function loadConfig() {
    try {
      var dir = path.dirname(CONFIG_FILE);
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (_) {}
    return {};
  }
  function saveConfig(obj) {
    try {
      var dir = path.dirname(CONFIG_FILE);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) {}
  }

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

  providerEl.addEventListener('change', function () {
    toggleProvider();
    var cfg = loadConfig();
    cfg.provider = providerEl.value;
    saveConfig(cfg);
  });
  [apiBaseEl, apiKeyEl, apiModelEl].forEach(function (el) {
    el.addEventListener('change', function () {
      var cfg = loadConfig();
      cfg.apiBase = apiBaseEl.value;
      cfg.apiKey = apiKeyEl.value;
      cfg.apiModel = apiModelEl.value;
      saveConfig(cfg);
    });
  });

  // ── Transcription ────────────────────────────
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

  function findWavePreset() {
    var adobe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Adobe');
    var versions = fs.readdirSync(adobe)
      .filter(function (n) { return /^Adobe Premiere Pro/.test(n); })
      .sort().reverse();
    for (var i = 0; i < versions.length; i++) {
      var p = path.join(adobe, versions[i], 'Settings', 'EncoderPresets', 'Wave48mono16.epr');
      if (fs.existsSync(p)) return p;
    }
    throw new Error('未找到 Premiere WAV 导出预设（Wave48mono16.epr）。');
  }

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

  document.getElementById('transcribe').addEventListener('click', async function () {
    result.value = ''; srtPath = ''; addCaptions.disabled = true; exportSrt.disabled = true;
    setProgress(0);
    progressArea.style.display = '';
    var output;
    try {
      var cache = path.join(os.tmpdir(), 'PRSubtitleRecognizer');
      fs.mkdirSync(cache, { recursive: true });
      output = path.join(cache, 'sequence-' + Date.now() + '.wav');
      var preset = findWavePreset();
      setProgress(1);
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error((await resp.json()).detail || '服务请求失败');
      var job = await resp.json();
      result.value = await waitForJob(job.job_id);
      srtPath = output.replace(/\.wav$/i, '.srt');
      fs.writeFileSync(srtPath, result.value, { encoding: 'utf8' });
      addCaptions.disabled = false;
      exportSrt.disabled = false;
      setStatus('识别完成，SRT 已导入项目面板。', false);
    } catch (err) {
      setStatus('任务失败：' + err.message, true);
      progressArea.style.display = 'none';
    }
  });

  addCaptions.addEventListener('click', async function () {
    if (!srtPath || !result.value) return;
    setStatus('正在创建字幕轨道…');
    var msg = await evalHost('prSubtitleImportCaption(' + JSON.stringify(srtPath) + ')');
    setStatus(msg.indexOf('OK:') === 0 ? '字幕轨道创建成功。' : '创建失败：' + msg, msg.indexOf('OK:') !== 0);
  });

  exportSrt.addEventListener('click', function () {
    if (!result.value) return;
    var f = csInterface.getSystemPath('userData') + '/subtitles_' + Date.now() + '.srt';
    fs.writeFileSync(f.replace(/\\/g, '/'), result.value, { encoding: 'utf8' });
    setStatus('已导出到：' + f);
  });

  refreshSequenceName();
  setInterval(refreshSequenceName, 2000);
}());
