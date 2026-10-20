---
name: in-html
description: Use when the user wants a plan, specification, write-up, findings, summary, report, comparison, or similar communication delivered as a standalone HTML document. Do not use for HTML that ships inside software.
---

Create one polished HTML file as the complete deliverable. Keep the document self-contained: put its content, CSS, JavaScript, data, and visuals in that file. Inline SVG or canvas works well for custom graphics. CDN libraries are allowed when they materially improve the result; prefer native HTML, CSS, and JavaScript when they keep it simpler. Do not create companion files.

Shape the page around the material and its reader. Preserve the source's meaning, facts, caveats, and uncertainty; do not invent data to fill visual gaps or infer causes or seasonal context from dates alone. Use a clear hierarchy, readable typography, deliberate spacing, and a restrained palette. Make the layout work on narrow screens as well as desktop.

Choose visuals that make the content easier to understand. For example, show a plan as a timeline when sequence matters, use a comparison table when readers need to scan differences, chart quantitative data when its pattern matters, and diagram a process or relationships when structure matters. Keep labels, units, scales, and relevant source notes visible. Use the simplest form that communicates the point.

Choose interaction by its value to the reader. Add sorting, filtering, selection, or disclosure when it helps readers explore or navigate substantial content. Keep a concise document static when that communicates it clearly; make interaction part of the experience when it materially improves understanding. Make controls obvious, keyboard usable, and labeled; do not hide essential conclusions behind them or rely on hover alone.

Use semantic HTML, sufficient contrast, and visible focus states. Before delivery, inspect the page at a narrow and wide viewport when preview tools are available, and check that its content and any controls work. Deliver the HTML file itself. If the environment cannot attach or link a file, provide the complete source in one HTML code block.
