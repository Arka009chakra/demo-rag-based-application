# RAG PDF Assistant — UI only

A responsive React + Vite frontend inspired by the supplied reference screenshot.

## Run locally
1. Install Node.js (18+ recommended).
2. In this folder run:
   ```bash
   npm install
   npm run dev
   ```
3. Open the local URL printed by Vite.

## Included UI interactions
- PDF file picker and drag-and-drop upload (client-side display only)
- Document list search and remove action
- Dashboard summary cards
- Chat message composer, clear chat, source list, suggested prompts
- Light/dark theme toggle
- Responsive desktop, tablet and mobile layouts

## Backend integration note
This ZIP contains only the UI. PDF processing, persistent storage, retrieval, citations, and LLM responses are placeholders and need to be connected to your backend/API.
