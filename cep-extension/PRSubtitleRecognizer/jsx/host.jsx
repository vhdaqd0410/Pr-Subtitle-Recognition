function prSubtitlePluginVersion() { return "0.2.0"; }

function prSubtitleActiveSequenceName() {
    var sequence = app.project.activeSequence;
    return sequence ? "OK:" + sequence.name : "No active sequence. Open the target sequence in Premiere Pro.";
}

function prSubtitleExportActiveSequence(outputPath, presetPath) {
    try {
        var sequence = app.project.activeSequence;
        if (!sequence) return "No active sequence. Open the target sequence in Premiere Pro.";
        var preset = new File(presetPath);
        if (!preset.exists) return "WAV export preset was not found: " + presetPath;
        var output = new File(outputPath);
        if (!sequence.exportAsMediaDirect(output.fsName, preset.fsName, 0)) return "Premiere Pro could not export the active sequence audio.";
        if (!output.exists) return "Premiere export finished, but the WAV file was not created.";
        return "OK:" + output.fsName;
    } catch (error) { return "Premiere export error: " + error; }
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
        if (!captionFile.exists) return "The generated SRT file was not found.";
        var existingItem = prSubtitleFindProjectItem(app.project.rootItem, captionFile.fsName);
        if (existingItem) return "OK: SRT is already in the project panel";
        var targetBin = app.project.getInsertionBin() || app.project.rootItem;
        if (!app.project.importFiles([captionFile.fsName], true, targetBin, false)) return "Premiere Pro could not import the SRT file.";
        var captionItem = prSubtitleFindProjectItem(app.project.rootItem, captionFile.fsName);
        if (!captionItem) return "SRT imported, but its project item was not found.";
        return "OK: SRT imported into the project panel";
    } catch (error) { return "Premiere script error: " + error; }
}

function prSubtitleImportCaption(srtPath) {
    try {
        var sequence = app.project.activeSequence;
        if (!sequence) return "Open a target sequence in Premiere Pro first.";
        var imported = prSubtitleImportSrt(srtPath);
        if (imported.indexOf("OK:") !== 0) return imported;
        var captionFile = new File(srtPath);
        var captionItem = prSubtitleFindProjectItem(app.project.rootItem, captionFile.fsName);
        if (!captionItem) return "SRT is not available in the project panel.";
        if (!sequence.createCaptionTrack(captionItem, 0, Sequence.CAPTION_FORMAT_SUBTITLE)) return "SRT imported, but caption-track creation failed.";
        return "OK: caption track created";
    } catch (error) { return "Premiere script error: " + error; }
}
