# PageCapture Chrome Extension

**Full-fidelity DOM extractor for AI memory and context systems.**

Captures the complete visible content of any webpage — headings, paragraphs, code blocks, tables, lists, links — and stores it locally in structured markdown-like text. No APIs. No servers. Everything runs in your browser.

---

## Folder Structure

```
page-capture-extension/
├── manifest.json       ← Manifest V3 config
├── background.js       ← Service worker: message broker + storage
├── content.js          ← DOM traversal + markdown extraction engine
├── popup.html          ← Extension popup UI
├── popup.js            ← Popup controller logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## How to Load in Chrome (Unpacked Extension)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer Mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `page-capture-extension/` folder
5. The extension icon will appear in your toolbar

> **Tip:** Pin the extension by clicking the puzzle piece icon → pin PageCapture.

---

## How to Use

1. Navigate to any webpage (not a `chrome://` page)
2. Click the PageCapture extension icon
3. Click **"⊙ Capture Current Page"**
4. Wait for **"✓ Page Saved Successfully"**
5. Click **"View Captures"** to see the history list

---

## What Gets Captured

| Element         | How it's preserved                                      |
| --------------- | ------------------------------------------------------- |
| Headings        | `# H1`, `## H2`, … `###### H6`                         |
| Paragraphs      | Separated by blank lines                                |
| `<pre>` blocks  | Wrapped in ```` ```lang ``` ```` fences, exact spacing  |
| Inline `<code>` | Wrapped in backticks `` `code` ``                       |
| Lists `<ul>`    | `- item` with nested indentation                        |
| Lists `<ol>`    | `1. item` with auto-numbering                           |
| Tables          | ASCII pipe-separated columns with header separator      |
| Blockquotes     | `> text` prefix on every line                           |
| Links           | `[text](url)` — URLs resolved to absolute               |
| Bold / Italic   | `**bold**` / `_italic_`                                 |
| Images          | `[Image: alt text]`                                     |
| Line breaks     | Preserved as `\n`                                       |
| Horizontal rule | `---`                                                   |

---

## Storage Schema

Captures are stored in `chrome.storage.local` under the key `pageCaptures` as a JSON array (newest-first). Each entry:

```json
{
  "title":     "Page Title",
  "url":       "https://example.com/page",
  "timestamp": "2025-05-21T12:34:56.789Z",
  "content":   "# Page Title\n\nFull extracted markdown text…"
}
```

Maximum 50 captures are retained. Older entries are pruned automatically.

---

## Accessing Captured Data Programmatically

Open DevTools on any page, then:

```js
chrome.storage.local.get('pageCaptures', (result) => {
  console.log(result.pageCaptures);
});
```

Or from within the extension context (background / popup):

```js
chrome.storage.local.get('pageCaptures', ({ pageCaptures }) => {
  const latest = pageCaptures[0];
  console.log(latest.content);
});
```

---

## Architecture Notes

### Manifest V3
- Uses `scripting.executeScript` with `files: ['content.js']` instead of static `content_scripts` in manifest (injection is on-demand, not on every page load).
- Background is a **service worker** — ephemeral, no DOM access, no persistent variables between invocations. All state is in `chrome.storage.local`.

### Extraction Design
- `content.js` uses recursive **DOM tree traversal** (`walkNode`) rather than `innerText` alone, giving full control over formatting.
- Code fences (`<pre>`, `<code>`) are captured via `element.innerText` which respects CSS `white-space: pre` exactly.
- Post-processing pipeline only modifies text **outside** code fences, preserving indentation inside them.
- Hidden elements (`display:none`, `visibility:hidden`, `opacity:0`) are skipped.
- Duplicate consecutive lines are removed (catches repeated navigation items).

---

## Permissions Used

| Permission   | Why                                                          |
| ------------ | ------------------------------------------------------------ |
| `activeTab`  | Access the current tab's URL and metadata                    |
| `scripting`  | Inject `content.js` into the page on button click           |
| `storage`    | Save captured content to `chrome.storage.local`             |

---

## Limitations

- Cannot capture content inside `<iframe>`, `<canvas>`, or `<shadow-root>` elements
- `chrome://`, `chrome-extension://`, and `about:` pages cannot be captured (browser restriction)
- Dynamic content loaded after page load may be captured if visible in the DOM at click time
- PDFs opened in Chrome's built-in viewer are not supported

---

## Future Enhancements (Roadmap Ideas)

- [ ] Export capture as `.md` / `.txt` file download
- [ ] Copy to clipboard button
- [ ] Search within captures
- [ ] Selective capture (highlight + right-click)
- [ ] Sync to Google Drive or Notion via API
- [ ] Shadow DOM traversal
- [ ] MutationObserver mode for live page capture
