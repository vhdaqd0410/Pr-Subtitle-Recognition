# PR 字幕识别

Premiere Pro CEP 扩展面板。将序列音频导出为 WAV，本地或在线语音识别后生成 SRT 字幕，支持 AI 翻译生成双语字幕。

## 功能

**🎤 语音识别**
- **本地模型** — faster-whisper small，CUDA / CPU 自动切换，完全离线
- **在线 API** — 支持 OpenAI / Groq / SiliconFlow 等 Whisper 兼容接口
- **导出范围** — 全部时间轴 / 入出点 / 选中片段
- **批量识别** — 勾选序列列表，自动排队处理，SRT 逐个导入项目面板

**🌐 AI 翻译**
- 识别后一键翻译为英文 / 日文 / 韩文等
- 支持 DeepSeek / OpenAI / Groq / SiliconFlow
- 保留原文，生成**双语字幕**
- 翻译配置独立保存，下拉预设，一键锁定

**✏️ 编辑与管理**
- 识别结果可在面板中**直接编辑**再导入
- **历史记录** — 自动保存最近 20 条，标注序列名
- **预设管理** — 保存常用设置，一键切换

**🖥️ 体验**
- 全中文卡片式界面，服务状态实时指示灯
- 切换时间线自动跟随，高亮提示
- 快捷键 `F5` 识别 / `Ctrl+S` 导出
- **便携版** — 单文件 exe，解压即用，无需 Python / FFmpeg

## 快速开始（便携版）

1. 下载 `portable.zip` 并解压
2. 双击 `启用CEP调试模式.reg` → 确认
3. 双击 `安装扩展.bat` → 自动安装到 Premiere
4. 双击 `启动服务.bat`
5. 打开 Premiere → `Window > Extensions > PR 字幕识别`

## 在线 API

| 服务 | 识别模型 | 翻译模型 |
|------|---------|---------|
| DeepSeek | — | `deepseek-v4-pro` |
| OpenAI | `whisper-1` | `gpt-4o-mini` |
| Groq（免费） | `whisper-large-v3` | `llama-3.3-70b-versatile` |
| SiliconFlow | `FunAudioLLM/SenseVoiceSmall` | `Qwen/Qwen2.5-7B-Instruct` |

> 翻译和识别可分别配置不同服务商。

## 开发部署

```powershell
git clone https://github.com/vhdaqd0410/Pr-Subtitle-Recognition.git
cd Pr-Subtitle-Recognition
git lfs install && git lfs pull
cd server && pip install -r requirements.txt
python app.py   # http://127.0.0.1:8765
```

环境变量：`PR_SUBTITLE_DEVICE=cpu`（强制 CPU）/ `PR_SUBTITLE_MODEL_DIR`（指定模型目录）/ `HF_ENDPOINT`（HF 镜像）

## 打包

```powershell
.\build.bat   # 生成 portable\ 目录，压缩即分发
```

## 项目结构

```text
cep-extension/PRSubtitleRecognizer/  CEP 面板
server/                              识别服务
models/                              语音模型（Git LFS）
portable/                            便携版输出
build.bat                            打包脚本
install.bat                          一键安装脚本
```
