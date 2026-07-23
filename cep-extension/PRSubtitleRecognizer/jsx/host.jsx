// JSON polyfill for older Premiere versions
if (typeof JSON === 'undefined') {
    var JSON = {
        stringify: function (obj) {
            if (obj === null || obj === undefined) return 'null';
            if (typeof obj === 'string') return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
            if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
            if (obj instanceof Array) {
                var a = []; for (var i = 0; i < obj.length; i++) a.push(JSON.stringify(obj[i])); return '[' + a.join(',') + ']';
            }
            if (typeof obj === 'object') {
                var p = []; for (var k in obj) { if (obj.hasOwnProperty(k)) p.push(JSON.stringify(k) + ':' + JSON.stringify(obj[k])); }
                return '{' + p.join(',') + '}';
            }
            return 'null';
        },
        parse: function (str) { return eval('(' + str + ')'); }
    };
}

function prSubtitlePluginVersion() { return "3.0.0"; }

function prSubtitleListSequences() {
    try {
        var seqs = [];
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            seqs.push(app.project.sequences[i].name);
        }
        return "OK:" + JSON.stringify(seqs);
    } catch (e) { return "错误：" + e; }
}

function prSubtitleActivateSequence(name) {
    try {
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            if (app.project.sequences[i].name === name) {
                app.project.activeSequence = app.project.sequences[i];
                return "OK:" + name;
            }
        }
        return "未找到序列：" + name;
    } catch (e) { return "错误：" + e; }
}

function prSubtitleActiveSequenceName() {
    var sequence = app.project.activeSequence;
    return sequence ? "OK:" + sequence.name : "未检测到活动序列，请在 Premiere 中打开目标序列。";
}

function prSubtitleExportActiveSequence(outputPath, presetPath, rangeMode) {
    var sequence = app.project.activeSequence;
    if (!sequence) return "未检测到活动序列，请在 Premiere 中打开目标序列。";

    var preset = new File(presetPath);
    if (!preset.exists) return "未找到 WAV 导出预设：" + presetPath;

    var exportType = 0;
    var savedIn, savedOut;

    try {
        if (rangeMode === "work") {
            exportType = 1;
        } else if (rangeMode === "selected") {
            var minSec = Infinity, maxSec = -Infinity, found = false;
            var tracks = sequence.videoTracks;
            for (var t = 0; t < tracks.numTracks; t++) {
                var track = tracks[t];
                for (var c = 0; c < track.clips.numItems; c++) {
                    var clip = track.clips[c];
                    try {
                        if (clip.selected) {
                            found = true;
                            var s = clip.start.seconds;
                            var e = clip.end.seconds;
                            if (s < minSec) minSec = s;
                            if (e > maxSec) maxSec = e;
                        }
                    } catch (_) {}
                }
            }
            if (!found) return "未选中任何剪辑片段，请在时间轴上选中后再试。";
            savedIn = sequence.getInPoint().seconds;
            savedOut = sequence.getOutPoint().seconds;
            sequence.setInPoint(minSec);
            sequence.setOutPoint(maxSec);
            exportType = 1;
        }

        var output = new File(outputPath);
        if (!sequence.exportAsMediaDirect(output.fsName, preset.fsName, exportType))
            return "Premiere 无法导出当前序列的音频。";
        if (!output.exists) return "导出已完成，但未生成 WAV 文件。";
        return "OK:" + output.fsName;
    } catch (error) { return "导出错误：" + error; }
    finally {
        if (savedIn !== undefined) {
            try { sequence.setInPoint(savedIn); } catch (_) {}
            try { sequence.setOutPoint(savedOut); } catch (_) {}
        }
    }
}

function prSubtitleFindProjectItem(item, mediaPath) {
    if (item && item.getMediaPath && item.getMediaPath() === mediaPath) return item;
    if (item && item.children) {
        for (var i = 0; i < item.children.numItems; i++) {
            var found = prSubtitleFindProjectItem(item.children[i], mediaPath);
            if (found) return found;
        }
    }
    return null;
}

function prSubtitleImportSrt(srtPath) {
    try {
        var captionFile = new File(srtPath);
        if (!captionFile.exists) return "未找到生成的 SRT 文件。";
        var existingItem = prSubtitleFindProjectItem(app.project.rootItem, captionFile.fsName);
        if (existingItem) return "OK: SRT 已在项目面板中";
        var targetBin = app.project.getInsertionBin() || app.project.rootItem;
        if (!app.project.importFiles([captionFile.fsName], true, targetBin, false)) return "Premiere 无法导入 SRT 文件。";
        var captionItem = prSubtitleFindProjectItem(app.project.rootItem, captionFile.fsName);
        if (!captionItem) return "SRT 已导入，但未找到对应的项目项。";
        return "OK: SRT 已导入项目面板";
    } catch (error) { return "脚本错误：" + error; }
}

function prSubtitleListProjectSrts() {
    var result = [];
    function walk(item) {
        if (!item) return;
        try {
            var mp = item.getMediaPath ? item.getMediaPath() : '';
            if (mp && /\.srt$/i.test(mp)) {
                result.push({ name: item.name, path: mp });
            }
        } catch (_) {}
        if (item.children) {
            for (var i = 0; i < item.children.numItems; i++) {
                walk(item.children[i]);
            }
        }
    }
    try { walk(app.project.rootItem); } catch (e) {}
    return "OK:" + JSON.stringify(result);
}

function prSubtitleImportCaption(srtPath) {
    try {
        var sequence = app.project.activeSequence;
        if (!sequence) return "请先在 Premiere 中打开目标序列。";
        var imported = prSubtitleImportSrt(srtPath);
        if (imported.indexOf("OK:") !== 0) return imported;
        var captionFile = new File(srtPath);
        var captionItem = prSubtitleFindProjectItem(app.project.rootItem, captionFile.fsName);
        if (!captionItem) return "SRT 不在项目面板中。";
        if (!sequence.createCaptionTrack(captionItem, 0, Sequence.CAPTION_FORMAT_SUBTITLE)) return "SRT 已导入，但字幕轨道创建失败。";
        return "OK: 字幕轨道创建成功";
    } catch (error) { return "脚本错误：" + error; }
}
