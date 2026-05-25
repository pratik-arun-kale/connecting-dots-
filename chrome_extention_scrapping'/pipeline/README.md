# AI Memory Ingestion Pipeline

This folder contains a modular JavaScript pipeline that converts noisy raw webpage captures into structured, semantic memory-ready data.

## Architecture

- `index.js` — primary entry point for processing a raw capture through the pipeline.
- `noiseRemover.js` — removes UI noise, repeated labels, footer junk, and other clutter while preserving code blocks and spacing.
- `semanticExtractor.js` — chooses a parser based on page source and extracts semantic structure.
- `normalizer.js` — converts parser output into a consistent structured schema.
- `utils.js` — helper utilities for whitespace normalization, code block preservation, deduplication, and embedding chunk preparation.
- `parsers/chatgptParser.js` — source-specific parser for ChatGPT transcripts.
- `parsers/claudeParser.js` — source-specific parser for Claude transcripts.
- `parsers/genericParser.js` — fallback parser for generic webpages.
- `example.js` — sample invocation and expected output format.

## Goals

- Remove noisy UI text such as sidebars, navigation, profile sections, upgrade buttons, and repeated labels.
- Preserve code blocks, indentation, lists, headings, and markdown-like structure.
- Extract chat messages and preserve conversation order for AI memory use.
- Generate a clean structured output optimized for RAG, embeddings, semantic search, and memory systems.

## Example Output Format

```json
{
  "metadata": {
    "title": "...",
    "url": "...",
    "capturedAt": "...",
    "source": "chatgpt.com"
  },
  "content": {
    "type": "chat",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ]
  },
  "stats": {
    "rawLength": 0,
    "cleanedLength": 0,
    "messagesCount": 0
  }
}
```

## Usage

```js
import { processCapture } from './pipeline/index.js';

const cleaned = processCapture(rawCapture);
```

No external APIs are used. All pipeline steps run locally and are designed for maintainability and future AI memory ingestion.
