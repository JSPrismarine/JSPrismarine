# Brief fills for a visual surface

What goes into the `{{...}}` slots of the scoring loop's
[`judge-brief.md`](../scoring-loop/judge-brief.md) when the artifact is a visual surface. Use the
slot's own wording where a slot is not listed here.

- **Kind of judge**: "design".
- **Guide or spec**: the brand or design guide.
- **File naming**: "Files are `<page>-<mode>.png`. Modes: `light` (1280 wide), `dark` (1280 wide),
  `mobile` (390 wide, light). Pages: `<id>` (what it is), one per page. Long pages are cropped to
  their top section."
- **Capture limits**, each as its own bullet:
  - Fixed and sticky elements are drawn once at the top of a full-page capture. Name what that
    does to this surface, such as a sidebar's tinted column appearing to stop partway down.
  - The captures use reduced motion. Name what that hides, such as a scrolling ticker and its
    Pause button.
  - Interactive behavior a still image cannot show, and that works as labeled.
- **Source, to confirm claims**: the theme or component source.
- **Measurable failures**: "Before you report a contrast or size failure, confirm it in the source
  CSS." Name the tokens that carry the answer, such as the text-on-accent token and the label size
  variable.
- **Facts the surface cannot show**: star counts, downloads, user numbers, or whatever else the
  project does not record.
- **Decided, do not raise**: the brand elements the user wants kept, such as solid color tiles.
- **Areas**: "visual craft (hierarchy, type, spacing), product clarity (what it is, who it is for,
  what to do next) and reading experience with accessibility (wayfinding, legibility, contrast,
  targets)".
- **Best-in-class references**: three to five surfaces of the same kind.
- **Rubric**, for a docs site and landing page:
  1. Visual craft.
  2. Brand coherence.
  3. Landing effectiveness: in five seconds, what it is, who it is for, what to do next.
  4. Docs reading experience.
  5. Dark mode quality.
  6. Mobile quality at 390 px.
  7. Accessibility visible in the screenshots: contrast, focus, target size, text size.

  Landing effectiveness and docs reading experience count double. Swap the two for the criteria
  that carry another kind of surface.
- **Improvement format**: the evidence file is "the screenshot (page and mode)", and the fix is "at
  the CSS or component level where you can".
- **Comparison**: "For each page and mode", and name "an element, a spacing, a color, a line of
  copy" when saying what a version has.
