/* global require, CSInterface */
(function () {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const addCaptions = document.getElementById('add-captions');
  const sequenceName = document.getElementById('sequence-name');
  const progressBar = document.getElementById('progress-bar');
  const csInterface = new CSInterface();
  let srtPath = '';
  const CONFIG_FILE = path.join(os.tmpdir(), 'PRSubtitleRecognizer', 'config.json');

  function setProgress(percentage) { progressBar.style.width = Math.max(0, Math.min(100, percentage)) + '%'; }
  function setStatus(message, isError) {
    status.textContent = message; status.className = isError ? 'error' : '';
    var match = message.match(/（(\d+)%）/);
    if (match) setProgress(Number(match[1]));
  }
  function evalHost(script) { return new Promise(function (resolve) { csInterface.evalScript(script, resolve); }); }
  function wait(milliseconds) { return new Promise(function (resolve) { setTimeout(resolve, milliseconds); }); }

  // ── Settings persistence ──────────────────────
  function loadConfig() {
    try {
      var dir = path.dirname(CONFIG_FILE);
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      }
    } catch (_) { /* ignore */ }
    return {};
  }
  function saveConfig(obj) {
    try {
      var dir = path.dirname(CONFIG_FILE);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) { /* ignore */ }
  }

  // ── Provider switch ───────────────────────────
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

  // Load saved config
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

  // ── Transcription ─────────────────────────────
  async function waitForJob(jobId) {
    while (true) {
      var response = await fetch('http://127.0.0.1:8765/jobs/' + jobId);
      if (!response.ok) throw new Error('无法读取识别进度。');
      var job = await response.json();
      setStatus(job.message + '（' + job.progress + '%）', job.state === 'failed');
      if (job.state === 'completed') return job.result;
      if (job.state === 'failed') throw new Error(job.message);
      await wait(700);
    }
  }

  function findWavePreset() {
    var adobe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Adobe');
    var versions = fs.readdirSync(adobe)
      .filter(function (name) { return /^Adobe Premiere Pro/.test(name); })
      .sort().reverse();
    for (var i = 0; i < versions.length; i++) {
      var preset = path.join(adobe, versions[i], 'Settings', 'EncoderPresets', 'Wave48mono16.epr');
      if (fs.existsSync(preset)) return preset;
    }
    throw new Error('未找到 Premiere WAV 导出预设文件（Wave48mono16.epr），请安装 Premiere Media Encoder 预设。');
  }

  async function refreshSequenceName() {
    var name = await evalHost('prSubtitleActiveSequenceName()');
    var display = name.indexOf('OK:') === 0 ? name.slice(3) : null;
    if (display) {
      var current = '当前序列：' + display;
      if (sequenceName.textContent !== current) {
        sequenceName.textContent = current;
        sequenceName.className = 'filename changed';
        clearTimeout(sequenceName._flashTimer);
        sequenceName._flashTimer = setTimeout(function () { sequenceName.className = 'filename'; }, 1500);
      }
    } else {
      sequenceName.textContent = name;
      sequenceName.className = 'filename';
    }
  }

  document.getElementById('transcribe').addEventListener('click', async function () {
    result.value = ''; srtPath = ''; addCaptions.disabled = true; setProgress(0);
    var output;
    try {
      var cache = path.join(os.tmpdir(), 'PRSubtitleRecognizer');
      fs.mkdirSync(cache, { recursive: true });
      output = path.join(cache, 'sequence-' + Date.now() + '.wav');
      var preset = findWavePreset();
      setProgress(1);
      var rangeMode = document.getElementById('range').value;
      var rangeLabel = { all: '全部', work: '入出点范围', selected: '选中片段' }[rangeMode];
      setStatus('正在从 Premiere 导出（' + rangeLabel + '）混音音频…');
      var exportResult = await evalHost('prSubtitleExportActiveSequence(' + JSON.stringify(output) + ',' + JSON.stringify(preset) + ',' + JSON.stringify(rangeMode) + ')');
      if (exportResult.indexOf('OK:') !== 0) throw new Error(exportResult);

      setStatus('音频导出完成，正在创建识别任务…');
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
      var response = await fetch('http://127.0.0.1:8765/transcribe-path', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error((await response.json()).detail || '识别服务请求失败');
      var job = await response.json();
      result.value = await waitForJob(job.job_id);
      srtPath = output.replace(/\.wav$/i, '.srt');
      fs.writeFileSync(srtPath, result.value, { encoding: 'utf8' });
      addCaptions.disabled = !result.value;
      setStatus('识别完成，正在将 SRT 导入 Premiere 项目面板…');
      var importMessage = await evalHost('prSubtitleImportSrt(' + JSON.stringify(srtPath) + ')');
      if (importMessage.indexOf('OK:') !== 0) throw new Error('SRT 已生成，但导入项目面板失败：' + importMessage);
      setStatus('识别完成，SRT 已导入 Premiere 项目面板。');
    } catch (error) { setStatus('任务失败：' + error.message, true); }
  });

  addCaptions.addEventListener('click', async function () {
    if (!srtPath || !result.value) return;
    setStatus('正在导入 SRT 并创建字幕轨道…');
    var message = await evalHost('prSubtitleImportCaption(' + JSON.stringify(srtPath) + ')');
    setStatus(message.indexOf('OK:') === 0 ? '字幕轨道创建成功。' : '字幕轨道创建失败：' + message, message.indexOf('OK:') !== 0);
  });

  refreshSequenceName();
  setInterval(refreshSequenceName, 2000);
}());
