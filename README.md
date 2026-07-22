# PR 字幕识别

Premiere Pro CEP 扩展面板。导出序列混音为 WAV，通过本地 faster-whisper 或在线 API 进行语音识别，自动生成 SRT 字幕并导入项目。

## 功能

- 🎤 **本地识别** — faster-whisper small 模型，CUDA 加速 / CPU 自动回退
- ☁️ **在线 API** — 支持 OpenAI / Groq / SiliconFlow 等兼容接口的 Whisper API
- 📐 **导出范围** — 全部时间轴 / 入出点 / 选中片段，自由选择
- ✏️ **字幕编辑** — 识别结果可直接在面板中编辑后再导入
- 📦 **批量识别** — 一键处理项目内所有序列
- 🌐 **翻译字幕** — 识别后通过 AI 翻译为其他语言（需 API Key）
- 📋 **历史记录** — 自动保存最近 20 条，标注序列名，随时恢复
- 💾 **预设管理** — 保存/加载常用设置组合
- ⌨️ **快捷键** — `F5` 开始识别，`Ctrl+S` 导出 SRT
- 🔄 **序列自动检测** — 切换时间线面板自动跟随
- 🖥️ **全中文界面** — 卡片式布局，服务状态实时指示
- 📦 **便携版** — 一键打包为 exe，解压即用，无需 Python/FFmpeg

## 快速开始（便携版）

1. 下载 [portable.zip](https://github.com/vhdaqd0410/Pr-Subtitle-Recognition/releases) 并解压
2. 双击 `启用CEP调试模式.reg` → 确认
3. 复制 `cep-extension\PRSubtitleRecognizer` 到 `%APPDATA%\Adobe\CEP\extensions\`
4. 双击 `启动服务.bat`
5. 打开 Premiere，`Window > Extensions > PR 字幕识别`

> 便携版已内置 Python、FFmpeg、语音模型，无需安装任何环境。

## 开发部署

### 环境要求

- Premiere Pro（支持 CEP 扩展）
- Python 3.10+
- Git LFS（模型文件）

### 克隆并启动

```powershell
git clone https://github.com/vhdaqd0410/Pr-Subtitle-Recognition.git
cd Pr-Subtitle-Recognition
git lfs install && git lfs pull
cd server
python -m pip install -r requirements.txt
python app.py
```

服务启动后监听 `http://127.0.0.1:8765`。

### 安装 CEP 扩展

```
复制 cep-extension\PRSubtitleRecognizer → %APPDATA%\Adobe\CEP\extensions\
双击 portable\启用CEP调试模式.reg（或手动设置注册表 CSXS.12 PlayerDebugMode=1）
```

### 网络受限环境

```powershell
# Hugging Face 镜像
$env:HF_ENDPOINT = 'https://hf-mirror.com'
python app.py

# 或指定本地模型目录
$env:PR_SUBTITLE_MODEL_DIR = 'D:\models\faster-whisper-small'
python app.py

# 强制 CPU 模式
$env:PR_SUBTITLE_DEVICE = 'cpu'
python app.py
```

## 在线 API 配置

选择「在线 API」模式后，填写以下信息：

| 服务 | API 地址 | 模型名 |
|------|---------|--------|
| OpenAI | `https://api.openai.com/v1` | `whisper-1` |
| Groq（免费） | `https://api.groq.com/openai/v1` | `whisper-large-v3` |
| SiliconFlow | `https://api.siliconflow.cn/v1` | `FunAudioLLM/SenseVoiceSmall` |

翻译功能需单独配置翻译模型（如 `gpt-4o-mini`、`deepseek-chat`、`llama-3.3-70b-versatile`）。

## 一键打包

```powershell
.\build.bat
```

生成 `portable\` 目录，压缩为 zip 即可分发。

## 项目结构

```text
cep-extension/PRSubtitleRecognizer/  CEP 面板（HTML/JS/ExtendScript）
server/                              本地服务（FastAPI + faster-whisper）
models/                              语音模型（Git LFS）
portable/                            便携版输出目录
build.bat                            一键打包脚本
```
