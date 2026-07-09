const { JSDOM } = require('jsdom');
const dom = new JSDOM();
const document = dom.window.document;
const temp = document.createElement('div');
temp.innerHTML = "<p>Hello</p><p>World</p>";
console.log("Paragraphs:", JSON.stringify(temp.innerText || temp.textContent));

temp.innerHTML = "Hello\nWorld";
console.log("Newlines:", JSON.stringify(temp.innerText || temp.textContent));

temp.innerHTML = "Hello<br>World";
console.log("BR:", JSON.stringify(temp.innerText || temp.textContent));
