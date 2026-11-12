---
name: design-scoring-loop
description: Hill-climb a visual surface (docs site, landing page, app screen, TUI) with the scoring loop's blind judges.
disable-model-invocation: true
---

# Design scoring loop

Read [`scoring-loop`](../scoring-loop/SKILL.md) in full and run its six steps. This skill supplies
what a visual surface adds to each: the evidence set is **screenshots**, the brief takes the fills
in [`brief-fills.md`](brief-fills.md), and one script runs the capture half of a round.

Before starting, also get from the user the pages or screens that matter and the brand elements
they want kept. Read the surface's design or brand guide in full (for JSPrismarine, run the
`design` skill, which points at `docs/brand/README.md`).

## Step 1: capture screenshots

1. Pick the build command, the serve command and a fixed port for the surface.
2. Install a headless browser in `$S/pw` when the host has none:
   `pnpm init -y && pnpm i playwright-core`, then
   `PLAYWRIGHT_BROWSERS_PATH=$S/pw/browsers npx playwright-core install chromium-headless-shell`.
3. Copy [`scripts/shoot.mjs`](scripts/shoot.mjs) into `$S/pw` and write a `shots.json` for the
   surface (the script's header documents the fields).
4. Capture round 0 with [`scripts/round.sh`](scripts/round.sh), from the directory the build runs
   in: `S=$S PORT=<port> BUILD='<build command>' SERVE='<serve command>' round.sh 0`.

The capture rules `shoot.mjs` applies, which a hand-rolled capture applies too:

- Every page of interest in light, dark and a 390 px phone width.
- An explicit browser locale (`en-US`). A host default such as `en-US@posix` breaks
  `Intl.DateTimeFormat` and looks like a site bug.
- Reduced motion, so animations settle into a stable frame. The brief says what that hides.
- Long pages cropped to a fixed top height, so images stay legible to a model.
- Full-page captures draw fixed and sticky elements once, at the top. Each such artifact goes in
  the brief as a capture limit.
- A full-page capture drops touch emulation while it draws, so `hover: none` and `pointer: coarse`
  rules do not show in it. Give a touch-only style a width query too, or check it in a viewport or
  element capture.

For a surface that is not a web page (a TUI, a native screen), capture with that surface's own
tool at fixed sizes and in each theme it supports.

## Step 2: fill the brief

Fill the scoring loop's template with [`brief-fills.md`](brief-fills.md): the file naming, the
capture limits, the source checks, the areas, the rubric and the improvement format for a visual
surface.

## Step 3: one command per round

`round.sh <n>` does steps 3.1 and 3.2 of the scoring loop: it stops the old server, builds,
serves, captures `$S/rounds/r<n>` and stages it beside the previous round, then prints the staged
directory for the panel. A failed build stops it before anything is captured.

## Step 4: acting on design findings

- The expressive brand elements the user values (colored tiles, illustrations, a mascot, a playful
  detail) are what the loop keeps. Judges call them redundant or noisy; improve the element, and
  remove one only with the user's agreement.
- Confirm a finding in the screenshot and in the source CSS before acting on it. Judges misread
  colors and report contrast failures the tokens already prevent.
- Look at every changed page in the built render before the next round: a rule that reads right in
  the source can be dropped or outweighed in the build.
- Make the changes under the repository's design rules: the `design` skill for this repository's
  surfaces, and its verification steps.

## Step 6: the guide

The code is the source of truth; the design guide follows it. Write each rule the loop established
into the guide (for JSPrismarine, `docs/brand/README.md`) in the commit that makes the change.
