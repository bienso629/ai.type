const { JSDOM } = require('jsdom');
const dom = new JSDOM();
const document = dom.window.document;

let value = "<p>Chào anh em nhé! Hôm nay mình ngoi\nlên để mổ xẻ bản cập nhật mới nhất c\nủa OpenAI về dòng GPT-\n5.6.</p>";

// Option 1: Replace \n with space
let v1 = value.replace(/(\r\n|\n|\r)/gm, ' ');
v1 = v1.replace(/<br\s*[\/]?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
const temp1 = document.createElement('div');
temp1.innerHTML = v1;
console.log("V1 (TextContent):", JSON.stringify(temp1.textContent));

