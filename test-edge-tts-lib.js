const { UniversalEdgeTTS } = require('edge-tts-universal');
const tts = new UniversalEdgeTTS('xin chào', 'vi-VN-HoaiMyNeural');
tts.synthesize().then(() => console.log('success')).catch(console.error);
