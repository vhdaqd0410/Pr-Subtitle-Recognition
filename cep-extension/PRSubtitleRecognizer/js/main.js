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
      if (!response.ok) throw new Error('Could not read transcription progress.');
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
    throw new Error('No Premiere Wave48mono16.epr preset was found. Install Premiere Media Encoder presets.');
  }

  async function refreshSequenceName() {
    const name = await evalHost('prSubtitleActiveSequenceName()');
    sequenceName.textContent = name.indexOf('OK:') === 0 ? 'Active sequence: ' + name.slice(3) : name;
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
      setStatus('第 1 步：正在从 Premiere 导出整个序列的混音音频…');
      const exportResult = await evalHost('prSubtitleExportActiveSequence(' + JSON.stringify(output) + ',' + JSON.stringify(preset) + ')');
      if (exportResult.indexOf('OK:') !== 0) throw new Error(exportResult);
      setStatus('音频导出完成，正在创建识别任务…');
      const response = await fetch('http://127.0.0.1:8765/transcribe-path', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_path: output, language: document.getElementById('language').value, model: document.getElementById('model').value }),
      });
      if (!response.ok) throw new Error((await response.json()).detail || 'Transcription server error');
      const job = await response.json();
      result.value = await waitForJob(job.job_id);
      srtPath = output.replace(/\.wav$/i, '.srt');
      fs.writeFileSync(srtPath, result.value, { encoding: 'utf8' });
      addCaptions.disabled = !result.value;
      setStatus('识别完成（100%），正在将 SRT 导入 Premiere 项目栏…');
      const importMessage = await evalHost('prSubtitleImportSrt(' + JSON.stringify(srtPath) + ')');
      if (importMessage.indexOf('OK:') !== 0) throw new Error('SRT 已生成，但导入项目栏失败：' + importMessage);
      setStatus('识别完成（100%），SRT 已导入 Premiere 项目栏。');
    } catch (error) { setStatus('任务失败：' + error.message, true); }
  });

  addCaptions.addEventListener('click', async function () {
    if (!srtPath || !result.value) return;
    setStatus('Importing SRT and creating the subtitle track...');
    const message = await evalHost('prSubtitleImportCaption(' + JSON.stringify(srtPath) + ')');
    setStatus(message.indexOf('OK:') === 0 ? 'Subtitle track created.' : 'Could not create subtitle track: ' + message, message.indexOf('OK:') !== 0);
  });

  refreshSequenceName();
}());
