# PR 字幕识别

Premiere Pro CEP 扩展面板。将序列音频导出为 WAV，通过本地 faster-whisper 或在线 API 进行语音识别，生成双语 SRT 并导入时间线。

## 功能

**🎤 语音识别**
- **本地模型** — faster-whisper small，CUDA 加速 / CPU 自动回退，完全离线
- **在线 API** — 支持 OpenAI / Groq / SiliconFlow 等 Whisper 兼容接口，识别更快更准
- **导出范围** — 全部时间轴 / 入出点 / 选中片段，灵活控制
- **批量识别** — 一键处理项目内所有序列

**🌐 AI 翻译**
- 识别后一键翻译为英文/日文/韩文等
- 支持 DeepSeek / OpenAI / Groq / SiliconFlow 等 API
- 翻译结果保留原文，生成**双语字幕**
- 翻译配置独立保存，点击锁定防误触

**✏️ 编辑与管理**
- 识别结果可直接在面板中**编辑**后再导入
- **历史记录** — 自动保存最近 20 条，标注序列名，随时恢复
- **预设管理** — 保存常用设置组合，一键切换

**🖥️ 体验**
- 全中文卡片式界面，服务状态实时指示灯
- 切换时间线面板自动跟随，高亮提示
- 快捷键：`F5` 识别，`Ctrl+S` 导出 SRT
- **便携版** — 打包为单个 exe，解压即用，无需安装 Python / FFmpeg

## 快速开始（便携版）

1. 下载 [portable.zip](https://github.com/vhdaqd0410/Pr-Subtitle-Recognition/releases) 并解压
2. 双击 `启用CEP调试模式.reg` → 确认
3. 复制 `cep-extension\PRSubtitleRecognizer` 到 `%APPDATA%\Adobe\CEP\extensions\`
4. 双击 `启动服务.bat`
5. 打开 Premiere，`Window > Extensions > PR 字幕识别`

## 在线 API 配置

| 服务 | 识别 API 地址 | 识别模型 | 翻译模型 |
|------|-------------|---------|---------|
| DeepSeek | `https://api.deepseek.com/v1` | — | `deepseek-v4-pro` |
| OpenAI | `https://api.openai.com/v1` | `whisper-1` | `gpt-4o-mini` |
| Groq（免费） | `https://api.groq.com/openai/v1` | `whisper-large-v3` | `llama-3.3-70b-versatile` |
| SiliconFlow | `https://api.siliconflow.cn/v1` | `FunAudioLLM/SenseVoiceSmall` | `Qwen/Qwen2.5-7B-Instruct` |

> 翻译和识别可分别配置不同服务商，互不影响。

## 开发部署

```powershell
git clone https://github.com/vhdaqd0410/Pr-Subtitle-Recognition.git
cd Pr-Subtitle-Recognition
git lfs install && git lfs pull
cd server
python -m pip install -r requirements.txt
python app.py                          # 监听 http://127.0.0.1:8765
```

环境变量：

| 变量 | 作用 |
|------|------|
| `PR_SUBTITLE_DEVICE=cpu` | 强制 CPU 模式 |
| `PR_SUBTITLE_MODEL_DIR` | 指定本地模型目录 |
| `HF_ENDPOINT` | Hugging Face 镜像地址 |

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
