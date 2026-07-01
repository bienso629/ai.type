import sys

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Normalize line endings for reliable matching
content = content.replace('\r\n', '\n')

# 1. Update payload destructuring and add targetWidth/targetHeight logic
old1 = '''        const { projectTitle, projectUuid, videos } = payload;
        if (!videos || videos.length === 0) {
            return { success: false, error: "Không có video nào để ghép." };
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";'''

new1 = '''        const { projectTitle, projectUuid, aspectRatio, videos } = payload;
        if (!videos || videos.length === 0) {
            return { success: false, error: "Không có video nào để ghép." };
        }

        let targetWidth = 1920;
        let targetHeight = 1080;
        if (aspectRatio === '9:16') {
            targetWidth = 1080;
            targetHeight = 1920;
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";'''

content = content.replace(old1, new1)

# 2. Update FFmpeg args to include scalePadFilter
old2 = '''            const hasAudio = await checkAudioStream(cleanPath);
            let args = [];

            if (hasAudio) {
                const atempoFilter = getAudioTempoFilter(actualSpeed);
                args = [
                    '-y',
                    '-ss', video.videoStart.toString(),
                    '-to', video.videoEnd.toString(),
                    '-i', cleanPath,
                    '-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS[v];[0:a]${atempoFilter}[a]`,
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
                    '-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS[v]`,
                    '-map', '[v]',
                    '-map', '1:a',
                    '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
                    '-c:a', 'aac',
                    '-shortest',
                    partPath
                ];
            }'''

new2 = '''            const hasAudio = await checkAudioStream(cleanPath);
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
            }'''

content = content.replace(old2, new2)

# 3. Strip query parameters in resolveMediaPath
old3 = '''            let originalPath = params.get('path') || '';
            originalPath = originalPath.replace(/^file:\\/\\//i, '');
            const mediaDir = params.get('dir') || '';'''

new3 = '''            let originalPath = params.get('path') || '';
            originalPath = originalPath.replace(/^file:\\/\\//i, '');
            // Strip any query strings (like ?t=123) that were appended for cache-busting
            if (originalPath.includes('?')) {
                originalPath = originalPath.split('?')[0];
            }
            if (originalPath.includes('#')) {
                originalPath = originalPath.split('#')[0];
            }
            const mediaDir = params.get('dir') || '';'''

content = content.replace(old3, new3)

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched main.js")
