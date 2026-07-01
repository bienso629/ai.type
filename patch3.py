import sys

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

helpers = """
async function checkAudioStream(filePath) {
    const ffmpegCmd = binaries.ffmpeg || "ffmpeg";
    try {
        await execPromise(`"${ffmpegCmd}" -i "${filePath}"`);
        return false;
    } catch (e) {
        return e.message.includes('Audio:');
    }
}

function getAudioTempoFilter(speed) {
    if (speed === 1) return 'atempo=1.0';
    if (speed > 2.0) {
        let filter = '';
        let s = speed;
        while (s > 2.0) { filter += 'atempo=2.0,'; s /= 2.0; }
        filter += `atempo=${s}`;
        return filter;
    } else if (speed < 0.5) {
        let filter = '';
        let s = speed;
        while (s < 0.5) { filter += 'atempo=0.5,'; s /= 0.5; }
        filter += `atempo=${s}`;
        return filter;
    }
    return `atempo=${speed}`;
}
"""

if "async function checkAudioStream" not in content:
    content = content.replace("async function getAudioDuration(filePath) {", helpers + "\\nasync function getAudioDuration(filePath) {")
    with open('electron/src/main.js', 'w', encoding='utf-8') as f:
        f.write(content)
        print("Helpers appended.")
else:
    print("Helpers already exist.")
