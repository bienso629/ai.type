const content1 = `
Here is your JSON:
\`\`\`json
[
  {
    "domain": "type.vn",
    "tasks": [
      {
        "name": "Task 1",
        "startDate": "2026-07-21T08:00:00"
      }
    ]
  }
]
\`\`\`
Hope it helps!`;

const content2 = `
[
  {
    "name": "Task 2",
    "startDate": "2026-07-21T08:00:00"
  }
]`;

const content3 = `
\`\`\`json
{
  "domain": "type.vn",
  "tasks": [
    {
      "name": "Task 3"
    }
  ]
}
\`\`\``;

function getParsedAiTask(content: string): any {
    if (!content) return null;
    
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let jsonStr = match && match[1] ? match[1].trim() : content;
    
    const startObj = jsonStr.indexOf('{');
    const startArr = jsonStr.indexOf('[');
    let endObj = jsonStr.lastIndexOf('}');
    let endArr = jsonStr.lastIndexOf(']');
    
    const start = startArr !== -1 && (startObj === -1 || startArr < startObj) ? startArr : startObj;
    let end = endArr !== -1 && (endObj === -1 || endArr > endObj) ? endArr : endObj;
    
    if (start !== -1) {
        if (end === -1 || end < start) {
            end = jsonStr.length;
        } else {
            end++;
        }
        jsonStr = jsonStr.substring(start, end);
    }
    
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Lỗi parse AI task:', e);
        return null;
    }
}

console.log("TEST 1 (Markdown array):", JSON.stringify(getParsedAiTask(content1)));
console.log("TEST 2 (Raw array):", JSON.stringify(getParsedAiTask(content2)));
console.log("TEST 3 (Markdown object):", JSON.stringify(getParsedAiTask(content3)));
