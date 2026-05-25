const fs = require('fs');
const path = require('path');

const projectDir = '/Users/yennguyen/Documents/ai.type/data/tts/admin/uAxqTmtq5';
const projectJsonPath = path.join(projectDir, 'project.json');

if (!fs.existsSync(projectJsonPath)) {
    console.error('Không tìm thấy project.json');
    process.exit(1);
}

let data = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
let modified = false;

const extractBasename = (url) => {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
    
    // Nếu có dạng đường dẫn (có dấu xuyệt)
    if (url.includes('/') || url.includes('\\')) {
        const basename = url.split(/[/\\]/).pop();
        modified = true;
        return basename;
    }
    return url;
};

if (data.videoProject) {
    if (data.videoProject.scenes) {
        data.videoProject.scenes.forEach(scene => {
            scene.imageUrl = extractBasename(scene.imageUrl);
            scene.customVideoPath = extractBasename(scene.customVideoPath);
            scene.audioLocalPath = extractBasename(scene.audioLocalPath);
            if (scene.videos) {
                scene.videos.forEach(video => {
                    video.imageUrl = extractBasename(video.imageUrl);
                    video.videoUrl = extractBasename(video.videoUrl);
                    video.customVideoPath = extractBasename(video.customVideoPath);
                });
            }
        });
    }
    
    if (data.videoProject.characters) {
        data.videoProject.characters.forEach((char) => {
            char.avatarUrl = extractBasename(char.avatarUrl);
            if (char.avatarUrls && Array.isArray(char.avatarUrls)) {
                char.avatarUrls = char.avatarUrls.map(url => extractBasename(url));
            }
        });
    }

    if (data.videoProject.existingCharacters) {
        data.videoProject.existingCharacters.forEach((char) => {
            char.avatarUrl = extractBasename(char.avatarUrl);
            if (char.avatarUrls && Array.isArray(char.avatarUrls)) {
                char.avatarUrls = char.avatarUrls.map(url => extractBasename(url));
            }
        });
    }
}

if (data.clips) {
    data.clips.forEach(clip => {
        clip.localFilePath = extractBasename(clip.localFilePath);
    });
}

if (modified) {
    fs.writeFileSync(projectJsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('Đã làm sạch project.json thành công, chỉ còn lại basename!');
} else {
    console.log('Không có đường dẫn nào cần clean.');
}
