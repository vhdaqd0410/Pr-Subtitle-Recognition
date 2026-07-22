# PR Subtitle Recognizer

A CEP panel for Adobe Premiere Pro. It exports the full mix of the
currently active sequence to WAV, transcribes it with faster-whisper, writes a
UTF-8 SRT file, and imports that SRT into the Premiere project panel.

## Features

- NVIDIA CUDA is attempted first using float16 for fast transcription.
- Automatic CPU int8 fallback keeps the plug-in usable without a CUDA-capable GPU.
- The panel renders the whole active sequence with Premiere's WAV export preset,
  then automatically imports the generated SRT into the current project. Adding
  it to the active sequence remains an optional follow-up action.
- Processing happens locally. The media is not uploaded to a cloud service.

## 环境要求

- Premiere Pro（支持 CEP 扩展）。
- Python 3.10 或更高版本。
- FFmpeg（需在 `PATH` 中可用）。
- CUDA 加速（可选）：NVIDIA GPU + CUDA 12 cuBLAS + cuDNN。无 GPU 时自动回退至 CPU。

## 新电脑部署

### 1. 克隆仓库

```powershell
git clone https://github.com/vhdaqd0410/Pr-Subtitle-Recognition.git
cd Pr-Subtitle-Recognition
```

### 2. 安装 Python 依赖

```powershell
cd server
python -m pip install -r requirements.txt
```

### 3. 准备语音识别模型

模型文件未包含在仓库中（太大），有两种方式获取：

**方式 A — 从原电脑拷贝（推荐离线环境）：**

将原电脑上 `models/faster-whisper-small/` 整个文件夹复制到新电脑的同路径下。

**方式 B — 让 faster-whisper 自动下载（需联网）：**

首次转录时会自动从 Hugging Face 下载。如果网络受限，使用镜像启动脚本：

```powershell
.\start-with-hf-mirror.ps1
```

或者手动设置环境变量：

```powershell
$env:HF_ENDPOINT = 'https://hf-mirror.com'
python app.py
```

> 也可通过 `PR_SUBTITLE_MODEL_DIR` 环境变量指向已下载的模型目录。

### 4. 安装 CEP 扩展

将 `cep-extension/PRSubtitleRecognizer` 文件夹复制到 CEP 扩展目录：

```
Windows: %APPDATA%\Adobe\CEP\extensions\
macOS:   ~/Library/Application Support/Adobe/CEP/extensions/
```

如果没有 `CEP\extensions` 目录，手动创建。

### 5. 启用 CEP 调试模式

打开注册表编辑器（`regedit`），导航到：

```
HKEY_CURRENT_USER\Software\Adobe\CSXS.12
```

新建字符串值 `PlayerDebugMode`，设为 `1`。

> 不同 Premiere 版本对应不同的 CSXS 版本号（如 CSXS.11、CSXS.12），请根据实际情况创建。

### 6. 启动服务并使用

1. 在 `server/` 目录下启动服务：

   ```powershell
   python app.py
   ```

   终端会显示 `CUDA` 或 `CPU` 表示当前使用的推理设备。

2. 重启 Premiere Pro，打开目标序列。

3. 在 Premiere 菜单栏中点击 `Window > Extensions > PR 字幕识别`。

4. 点击 **Transcribe active sequence** 开始识别。

## 使用步骤

1. 打开 Premiere Pro 并激活目标序列。
2. 从 `Window > Extensions` 打开 **PR Subtitle Recognizer**。
3. 选择语言和模型大小。
4. 点击 **Transcribe active sequence**：
   - 面板导出序列的完整混音音频。
   - 本地识别语音并显示进度。
   - SRT 自动导入 Premiere 项目面板。
5. （可选）点击 **按默认样式添加到当前序列**，将字幕轨道添加到当前序列。

## 项目结构

```text
cep-extension/PRSubtitleRecognizer/  CEP 面板和 Premiere ExtendScript
server/                              本地 faster-whisper 服务
models/                              语音识别模型文件（需自行准备）
```
