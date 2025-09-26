# Guided Steps Demo (Static)

A minimal single-page demo that replays recorded steps and highlights targets with an overlay. When selectors are missing, the app resolves targets using an LLM-style prompt (stubbed locally via `public/stub-response.json`).

How to run locally
- Use any static server. Example:
  - npx http-server ./public -p 8080 --cors
  - Open http://localhost:8080/task.html

How to use
- Click “Load example steps” or upload your own JSON via “Upload steps JSON”.
- Use the panel (Start/Prev/Next/Reset) to step through.
- The overlay dims the page and highlights the current target without blocking clicks.
- Open the browser console to see step execution and resolver decisions.

LLM/stub
- When a step is missing a selector, the app first tries `public/stub-response.json`. If not found, it falls back to a simple heuristic resolver that inventories labels/placeholders/text.

Time spent
- ~1.5 hours (structure, overlay/hole, resolver, wiring, docs).
