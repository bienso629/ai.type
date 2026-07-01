import sys

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace block 1: payload destructuring
s1_old = 'const { projectTitle, projectUuid, videos } = payload;'
s1_new = '''const { projectTitle, projectUuid, aspectRatio, videos } = payload;
        let targetWidth = 1920;
        let targetHeight = 1080;
        if (aspectRatio === '9:16') {
            targetWidth = 1080;
            targetHeight = 1920;
        }'''
content = content.replace(s1_old, s1_new)

# Replace block 2: scalePad filter string
s2_old = 'const hasAudio = await checkAudioStream(cleanPath);\n            let args = [];'
s2_new = '''const hasAudio = await checkAudioStream(cleanPath);
            let args = [];
            const scalePadFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`;'''
content = content.replace(s2_old, s2_new)
content = content.replace(s2_old.replace('\n', '\r\n'), s2_new)

# Replace block 3: filter_complex for hasAudio = true
s3_old = "'-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS[v];[0:a]${atempoFilter}[a]`,"
s3_new = "'-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS,${scalePadFilter}[v];[0:a]${atempoFilter}[a]`,"
content = content.replace(s3_old, s3_new)

# Replace block 4: filter_complex for hasAudio = false
s4_old = "'-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS[v]`,"
s4_new = "'-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS,${scalePadFilter}[v]`,"
content = content.replace(s4_old, s4_new)

# Replace block 5: stripping query strings from resolveMediaPath
s5_old = "let originalPath = params.get('path') || '';\n            originalPath = originalPath.replace(/^file:\\/\\//i, '');"
s5_new = '''let originalPath = params.get('path') || '';
            originalPath = originalPath.replace(/^file:\\/\\//i, '');
            if (originalPath.includes('?')) originalPath = originalPath.split('?')[0];
            if (originalPath.includes('#')) originalPath = originalPath.split('#')[0];'''
content = content.replace(s5_old, s5_new)
content = content.replace(s5_old.replace('\n', '\r\n'), s5_new)

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied.")
