import { GoogleGenAI } from '@google/genai';

async function run() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: 'Say hello world but in JSON format',
        config: { responseMimeType: 'application/json' }
    });
    console.log("RESPONSE:", response.text);
}
run().catch(console.error);
