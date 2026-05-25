import { processCapture } from './index.js';

const exampleCapture = {
  title: 'ChatGPT Conversation with Notes and UI Noise',
  url: 'https://chat.openai.com/chat/abc123',
  timestamp: '2026-05-21T12:29:48Z',
  content: `Skip to content
  ChatGPT
  Home · Updates · Settings
  
  User: Hello, please summarize the pipeline design.
  Assistant: The pipeline should be modular and preserve code blocks.
  
  ---
  Upgrade to Plus
  
  
  
  
  User: Include example JSON output.
  Assistant: Here is the clean structure:
  
  \`\`\`
  const x = 10;
  console.log(x);
  \`\`\`
  
  Footer · Privacy · Terms`
};

const processed = processCapture(exampleCapture);
console.log(JSON.stringify(processed, null, 2));
