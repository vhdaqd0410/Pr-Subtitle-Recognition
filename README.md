# PR 字幕识别 v3.0

Premiere Pro CEP 扩展面板。序列音频 → 语音识别 → SRT 字幕 → AI 翻译 → 直接导入。

## 功能

**🎤 语音识别**
- 本地 faster-whisper small（CUDA/CPU 自动切换）或在线 API
- 导出范围：全部 / 入出点 / 选中片段
- 批量勾选序列，排队处理，自动导入项目面板

**🌐 AI 翻译**
- 识别后或导入 SRT 文件一键翻译
- 支持 DeepSeek / OpenAI / Groq / SiliconFlow
- 保留原文，生成双语字幕
- 配置可保存锁定，防误触

**🖥️ 面板体验**
- 全中文卡片 UI，服务状态实时指示灯
- 面板内启停服务（▶/⏹），切换序列自动跟随
- 预设管理、历史记录、快捷键 F5 / Ctrl+S
- Web 后台管理：http://127.0.0.1:8765/dashboard

**📦 便携版** — 解压即用，无需 Python / FFmpeg


  网盘链接：
「PR字幕识别3.0.zip」
  链接：https://pan.quark.cn/s/748d1578cf15
  

  PR字幕识别3.0.zip
  链接: https://pan.baidu.com/s/1OynaKxTL3Nd4AJ3aeL_HPQ 提取码: 8wys 


## 快速开始

1. 下载 portable.zip 解压
2. 双击 `注册表.reg` → 双击 `安装扩展.bat`
3. 双击 `启动服务(静默).vbs` → 后台运行，无窗口
4. 打开 Premiere → Window → Extensions → PR 字幕识别

## API 配置

| 服务 | 识别模型 | 翻译模型 |
|------|---------|---------|
| DeepSeek | — | deepseek-v4-pro |
| OpenAI | whisper-1 | gpt-4o-mini |
| Groq | whisper-large-v3 | llama-3.3-70b |
| SiliconFlow | SenseVoiceSmall | Qwen2.5-7B |

## 开发

```powershell
git clone https://github.com/vhdaqd0410/Pr-Subtitle-Recognition.git
cd Pr-Subtitle-Recognition && git lfs pull
cd server && pip install -r requirements.txt && python app.py
```

## 打包

```powershell
.\build.bat  → 生成 portable\ 目录，压缩即分发
```
