import { GenerateContentParameters } from '@google/genai';
const params: GenerateContentParameters = {
  model: 'gemini-3.5-flash',
  contents: 'hello',
  config: {
    tools: [{ googleSearch: {} }]
  }
};
