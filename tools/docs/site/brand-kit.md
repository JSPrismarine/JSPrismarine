---
title: Brand kit
description: The JSPrismarine palette, mark, type and components, rendered live.
outline: deep
---

<script setup>
import { minecraftRange } from './.vitepress/theme/landing.ts';
import { palette } from './.vitepress/theme/tokens.ts';
import { data as project } from './project.data.mts';
import { data as releases } from './releases.data.mts';
</script>

# Brand kit

The rules live in the [brand guide](./brand/). This page renders the pieces they describe from the
same source the site uses, so what you see here is what ships.

## Palette

<div class="kit-swatches">
    <div v-for="(color, name) in palette" :key="name" class="kit-swatch">
        <span class="kit-swatch__chip" :style="{ background: `var(--jsp-${name})` }"></span>
        <b>{{ name }}</b>
        <code>--jsp-{{ name }}</code>
        <code>{{ color.hex }}</code>
        <span>{{ color.use }}</span>
    </div>
</div>

## Mark

<div class="kit-row">
    <div class="kit-tile is-light"><PrismMark :size="96" /></div>
    <div class="kit-tile is-forest"><PrismMark :size="96" /></div>
    <div class="kit-tile is-ink"><PrismMark :size="48" /><PrismMark :size="24" /><PrismMark :size="16" /></div>
</div>

```vue
<PrismMark :size="48" />
```

## Type

<div class="kit-type">
    <p class="kit-type__display">The Bedrock server you own.</p>
    <p class="kit-type__label">Bricolage Grotesque 800 · tracking −0.05em</p>
    <p class="kit-type__mono">pnpm run dev</p>
    <p class="kit-type__label">JetBrains Mono 400</p>
</div>

## Components

Every component below is registered globally, so a site page can use it without an import.

### BrandButton

<div class="kit-tile is-forest kit-tile--wide">
    <BrandButton href="/guide/running">Run a server</BrandButton>
    <BrandButton href="/guide/" variant="outline">Read the docs</BrandButton>
</div>

<div class="kit-row--buttons">
    <BrandButton href="/packages" variant="secondary">Packages</BrandButton>
</div>

```vue
<BrandButton href="/guide/running">Run a server</BrandButton>
<!-- outline sits on forest or ink, secondary on the page background -->
<BrandButton href="/guide/" variant="outline">Read the docs</BrandButton>
<BrandButton href="/packages" variant="secondary">Packages</BrandButton>
```

### TerminalWindow

<TerminalWindow>
    <span class="t-line"><span class="t-prompt">$</span> pnpm run dev</span>
    <span class="t-line"><span class="t-ok">[info]</span> JSPrismarine is now listening on port <span class="t-warn">{{ project.defaultPort }}</span></span>
    <span class="t-line"><span class="t-prompt">&gt;</span> <span class="t-cursor"></span></span>
</TerminalWindow>

```vue
<TerminalWindow>
    <span class="t-line"><span class="t-prompt">$</span> pnpm run dev</span>
    <span class="t-line"><span class="t-ok">[info]</span> JSPrismarine is now listening</span>
</TerminalWindow>
```

### BentoGrid and BentoTile

<BentoGrid>
    <BentoTile tone="accent" :span="2"><div class="bento-figure">{{ project.packages.length }}</div><p class="bento-caption"><b>accent</b>Published packages.</p></BentoTile>
    <BentoTile tone="signal" :span="2"><div class="bento-figure">{{ project.protocols.length }}</div><p class="bento-caption"><b>signal</b>Protocol versions.</p></BentoTile>
    <BentoTile tone="deep" :span="2"><div class="bento-figure">{{ project.defaultPort }}</div><p class="bento-caption"><b>deep</b>Default port.</p></BentoTile>
</BentoGrid>

```vue
<BentoGrid>
    <BentoTile tone="accent" :span="2">
        <div class="bento-figure">45</div>
        <p class="bento-caption"><b>Packages</b>Published on npm.</p>
    </BentoTile>
</BentoGrid>
```

### ParityBars

<div class="kit-tile is-forest kit-tile--wide"><ParityBars style="width: 100%" /></div>

```vue
<ParityBars :limit="3" />
```

### LatestRelease

<div class="kit-tile is-forest kit-tile--wide"><LatestRelease :release="releases.releases[0]" /></div>

```vue
<LatestRelease :release="releases.releases[0]" :limit="3" />
```

### ReleaseNotes

Release notes from the changelog, as on the [releases page](./releases). Long groups collapse behind a
button.

```vue
<ReleaseNotes :releases="releases.releases" />
```

### PackageDirectory

The filterable package grid on the [packages page](./packages).

```vue
<PackageDirectory :packages="project.packages" :repository-url="project.repositoryUrl" />
```

### CopyButton

<CopyButton text="pnpm run dev" />

```vue
<CopyButton text="pnpm run dev" />
```

### DemoServer

The landing page's full-width band for the demo server. It is made of the three components after it.

<DemoServer :demo="project.demo" :versions="minecraftRange(project)" />

```vue
<DemoServer :demo="project.demo" :versions="minecraftRange(project)" />
```

### WindowBlind

A cabin window with a blind. The default slot is printed on the blind, and the `sky` slot shows once the
blind is up. Pull or press the tab. The land passes only while the blind is up.

<div class="kit-tile is-ink kit-tile--wide">
    <WindowBlind style="width: min(360px, 100%); margin-inline: auto">
        <b>Pull the tab.</b>
        <template #sky>The land is behind it.</template>
    </WindowBlind>
</div>

```vue
<WindowBlind>
    <h2>Visit the demo.</h2>
    <template #sky>Open to anyone.</template>
</WindowBlind>
```

### BoardingPass

An upright pass that prints out of a slot when it scrolls into view. It leans toward the pointer, and its
stub tears off when pointed at, focused or tapped. The default slot is the body and the `stub` slot is the
stub, which links to `stub-href`.

<div class="kit-tile is-ink kit-tile--wide">
    <BoardingPass stub-href="https://jsprismarine.dev/" style="width: 100%">
        <b>The body of the pass.</b>
        <span>Anything can be printed here.</span>
        <template #stub><b>The stub.</b><span>Point at it.</span></template>
    </BoardingPass>
</div>

```vue
<BoardingPass stub-href="https://example.com/">
    The body of the pass.
    <template #stub>The stub.</template>
</BoardingPass>
```

### PassingLand

Land made of the mark's triangle, in two ranges. It moves only while `moving` is set.

<div class="kit-tile is-light kit-tile--wide" style="padding: 0; overflow: hidden">
    <PassingLand style="width: 100%; height: 160px" />
</div>

```vue
<PassingLand :moving="lookingOut" :span="220" />
```

### Code

Fenced code uses the ink surface and the brand syntax colors in both modes.

```ts
import { palette } from './tokens.ts';

// Keywords, strings, names and comments each take a brand color.
export const accent = palette.accent.hex;
export const names = Object.keys(palette).slice(0, 3);
```

### Ticker

It stops on hover and has a Pause button, which a mouse sees on hover and a touch screen always
shows. Under reduced motion it does not move, and the button is
hidden.

<Ticker :items="['Play it', 'Host it', 'Build on it', 'Fix it']" />

```vue
<Ticker :items="['Play it', 'Host it']" />
```

<style>
.kit-swatches {
    display: grid;
    /* Four across in the content column: seven colors sit as four and three, not three, three and one. */
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 128px), 1fr));
    gap: var(--jsp-gap);
    margin: 16px 0;
}

.kit-swatch {
    display: grid;
    /* Rows stack from the top, so a long description cannot push its label out of line. */
    align-content: start;
    gap: 2px;
    font-size: 13px;
    line-height: 1.4;
}

.kit-swatch__chip {
    display: block;
    height: 72px;
    margin-bottom: 6px;
    border: 1px solid var(--vp-c-divider);
    border-radius: var(--jsp-radius-control);
}

.kit-swatch code {
    justify-self: start;
}

/* Ink swatches and tiles are close to the dark page, so they take the dark hairline there. */
.dark .kit-swatch__chip {
    border-color: var(--jsp-dark-edge);
}

.dark .kit-tile.is-ink {
    box-shadow: inset 0 0 0 1px var(--jsp-dark-edge);
}

.kit-row {
    display: grid;
    /* Three columns or one, never two with an orphaned third tile. */
    grid-template-columns: repeat(auto-fit, minmax(min(100%, max(160px, calc((100% - 2 * var(--jsp-gap)) / 3))), 1fr));
    gap: var(--jsp-gap);
    margin: 16px 0;
}

.kit-row--buttons {
    margin: 16px 0;
}

.kit-tile {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: center;
    min-height: 150px;
    padding: 24px;
    border-radius: var(--jsp-radius-panel);
}

.kit-tile--wide {
    justify-content: flex-start;
    min-height: 0;
    margin: 16px 0;
}

.kit-tile.is-light {
    background: var(--jsp-cream);
}

.kit-tile.is-forest {
    color: var(--jsp-cream);
    background: var(--jsp-forest);
}

.kit-tile.is-ink {
    background: var(--jsp-ink);
}

.kit-type {
    padding: 24px;
    margin: 16px 0;
    color: var(--jsp-cream);
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-panel);
}

.kit-type p {
    line-height: 1.3;
    margin: 0;
}

.kit-type .kit-type__display {
    font-size: clamp(36px, 7vw, 64px);
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: -0.05em;
}

.kit-type .kit-type__mono {
    margin-top: 20px;
    font: 20px var(--vp-font-family-mono);
    color: var(--jsp-mint);
}

.kit-type .kit-type__label {
    margin-top: 6px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-mint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}
</style>
