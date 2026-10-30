const { generateEdgeAudio } = require('/home/yenai/Documents/Projects/Typing/ai.type/electron/.tmp-asar-test.js');
const start = Date.now();
generateEdgeAudio(
  { text: 'Kiem tra giong doc tu ban cai dat Ubuntu.', voice: 'vi-VN-HoaiMyNeural', rate: '+0%', pitch: '+0Hz' },
  '/home/yenai/Documents/Projects/Typing/ai.type/electron/.asar-test.mp3',
  m => process.stdout.write('[log] ' + m + '\n')
).then(r => {
  console.log('KET QUA:', JSON.stringify(r), '| thoi gian:', ((Date.now()-start)/1000).toFixed(1) + 's');
}).catch(e => {
  console.log('THAT BAI sau', ((Date.now()-start)/1000).toFixed(1) + 's:', e.message);
  process.exit(1);
});
