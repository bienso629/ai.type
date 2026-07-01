import sys

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Strip query string in resolveMediaPath
s1_old = "let originalPath = params.get('path') || '';\n            originalPath = originalPath.replace(/^file:\/\//i, '');"
if s1_old in content:
    s1_new = "let originalPath = params.get('path') || '';\n            originalPath = originalPath.replace(/^file:\/\//i, '');\n            if (originalPath.includes('?')) originalPath = originalPath.split('?')[0];\n            if (originalPath.includes('#')) originalPath = originalPath.split('#')[0];"
    content = content.replace(s1_old, s1_new)
else:
    print("WARNING: s1_old not found!")

# 2. Append render-final-composition if not exists
if "ipcMain.handle('render-final-composition'" not in content:
    # Append before module.exports or at the end
    handler = """
// =====================================================================
// RENDER FINAL COMPOSITION
// =====================================================================
ipcMain.handle('render-final-composition', async (event, payload) => {
    try {
        const { projectTitle, projectUuid, aspectRatio, videos } = payload;
        if (!videos || videos.length === 0) {
            return { success: false, error: "Không có video nào để ghép." };
        }

        let targetWidth = 1920;
        let targetHeight = 1080;
        if (aspectRatio === '9:16') {
            targetWidth = 1080;
            targetHeight = 1920;
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        const docPath = app.getPath('documents');
        const workspaceDir = path.join(docPath, 'ai.type', 'data', 'exports', 'workspace', projectUuid);
        const outputDir = path.join(docPath, 'ai.type', 'data', 'exports', 'output', projectUuid);

        if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        // Generate safe output name
        const safeTitle = (projectTitle || 'Untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const finalOutputPath = path.join(outputDir, `${safeTitle}_final.mp4`);

        let finalAudioListContent = "ffconcat version 1.0\\n";
        const sceneFiles = [];
        
        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const cleanPath = cleanFilePath(video.src);
            const partPath = path.join(workspaceDir, `final_scene_${i}.mp4`);
            sceneFiles.push(partPath);

            const actualSpeed = video.playbackRate || 1.0;
            const hasAudio = await checkAudioStream(cleanPath);
            let args = [];

            const scalePadFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`;

            if (hasAudio) {
                const atempoFilter = getAudioTempoFilter(actualSpeed);
                args = [
                    '-y',
                    '-ss', video.videoStart.toString(),
                    '-to', video.videoEnd.toString(),
                    '-i', cleanPath,
                    '-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS,${scalePadFilter}[v];[0:a]${atempoFilter}[a]`,
                    '-map', '[v]',
                    '-map', '[a]',
                    '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
                    '-c:a', 'aac', '-b:a', '128k',
                    partPath
                ];
            } else {
                args = [
                    '-y',
                    '-ss', video.videoStart.toString(),
                    '-to', video.videoEnd.toString(),
                    '-i', cleanPath,
                    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                    '-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS,${scalePadFilter}[v]`,
                    '-map', '[v]',
                    '-map', '1:a',
                    '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
                    '-c:a', 'aac',
                    '-shortest',
                    partPath
                ];
            }

            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                const child = spawn(ffmpegPath, args);
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Failed to encode scene ${i}`));
                });
            });

            finalAudioListContent += `file '${partPath}'\\n`;
        }

        const concatListPath = path.join(workspaceDir, 'final_concat.txt');
        fs.writeFileSync(concatListPath, finalAudioListContent, 'utf-8');

        // Concat the scenes
        const concatArgs = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c', 'copy',
            finalOutputPath
        ];

        await new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const child = spawn(ffmpegPath, concatArgs);
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Failed to concat final video`));
            });
        });

        return { success: true, path: finalOutputPath };

    } catch (error) {
        return { success: false, error: error.message };
    }
});
"""
    content += handler
    print("Appended render-final-composition.")

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch rebuild done.")
