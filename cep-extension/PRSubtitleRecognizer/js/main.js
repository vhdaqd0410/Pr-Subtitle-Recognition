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
  let lastSequenceName = '';

  function setProgress(percentage) { progressBar.style.width = Math.max(0, Math.min(100, percentage)) + '%'; }
  function setStatus(message, isError) {
    status.textContent = message; status.className = isError ? 'error' : '';
    const match = message.match(/（(\d+)%）/);
    if (match) setProgress(Number(match[1]));
  }
  function evalHost(script) { return new Promise(resolve => csInterface.evalScript(script, resolve)); }
  function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

  async function waitForJob(jobId) {
    while (true) {
      const response = await fetch('http://127.0.0.1:8765/jobs/' + jobId);
      if (!response.ok) throw new Error('无法读取识别进度。');
      const job = await response.json();
      setStatus(job.message + '（' + job.progress + '%）', job.state === 'failed');
      if (job.state === 'completed') return job.result;
      if (job.state === 'failed') throw new Error(job.message);
      await wait(700);
    }
  }

  function findWavePreset() {
    const adobe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Adobe');
    const versions = fs.readdirSync(adobe)
      .filter(name => /^Adobe Premiere Pro/.test(name))
      .sort().reverse();
    for (const version of versions) {
      const preset = path.join(adobe, version, 'Settings', 'EncoderPresets', 'Wave48mono16.epr');
      if (fs.existsSync(preset)) return preset;
    }
    throw new Error('未找到 Premiere WAV 导出预设文件（Wave48mono16.epr），请安装 Premiere Media Encoder 预设。');
  }

  async function refreshSequenceName() {
    const name = await evalHost('prSubtitleActiveSequenceName()');
    const display = name.indexOf('OK:') === 0 ? name.slice(3) : null;
    if (display) {
      const current = '当前序列：' + display;
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
    let output;
    try {
      const cache = path.join(os.tmpdir(), 'PRSubtitleRecognizer');
      fs.mkdirSync(cache, { recursive: true });
      output = path.join(cache, 'sequence-' + Date.now() + '.wav');
      const preset = findWavePreset();
      setProgress(1);
      setStatus('正在从 Premiere 导出序列混音音频…');
      const exportResult = await evalHost('prSubtitleExportActiveSequence(' + JSON.stringify(output) + ',' + JSON.stringify(preset) + ')');
      if (exportResult.indexOf('OK:') !== 0) throw new Error(exportResult);
      setStatus('音频导出完成，正在创建识别任务…');
      const response = await fetch('http://127.0.0.1:8765/transcribe-path', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_path: output, language: document.getElementById('language').value, model: document.getElementById('model').value }),
      });
      if (!response.ok) throw new Error((await response.json()).detail || '识别服务请求失败');
      const job = await response.json();
      result.value = await waitForJob(job.job_id);
      srtPath = output.replace(/\.wav$/i, '.srt');
      fs.writeFileSync(srtPath, result.value, { encoding: 'utf8' });
      addCaptions.disabled = !result.value;
      setStatus('识别完成，正在将 SRT 导入 Premiere 项目面板…');
      const importMessage = await evalHost('prSubtitleImportSrt(' + JSON.stringify(srtPath) + ')');
      if (importMessage.indexOf('OK:') !== 0) throw new Error('SRT 已生成，但导入项目面板失败：' + importMessage);
      setStatus('识别完成，SRT 已导入 Premiere 项目面板。');
    } catch (error) { setStatus('任务失败：' + error.message, true); }
  });

  addCaptions.addEventListener('click', async function () {
    if (!srtPath || !result.value) return;
    setStatus('正在导入 SRT 并创建字幕轨道…');
    const message = await evalHost('prSubtitleImportCaption(' + JSON.stringify(srtPath) + ')');
    setStatus(message.indexOf('OK:') === 0 ? '字幕轨道创建成功。' : '字幕轨道创建失败：' + message, message.indexOf('OK:') !== 0);
  });

  refreshSequenceName();
  setInterval(refreshSequenceName, 2000);
}());
