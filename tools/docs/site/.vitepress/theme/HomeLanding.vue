<script setup lang="ts">
import { withBase } from 'vitepress';

import { data as project } from '../../project.data.mts';
import { data as releases } from '../../releases.data.mts';
import AudienceTabs from './components/AudienceTabs.vue';
import BentoGrid from './components/BentoGrid.vue';
import BentoTile from './components/BentoTile.vue';
import BrandButton from './components/BrandButton.vue';
import CopyButton from './components/CopyButton.vue';
import LatestRelease from './components/LatestRelease.vue';
import ParityBars from './components/ParityBars.vue';
import PrismMark from './components/PrismMark.vue';
import TerminalWindow from './components/TerminalWindow.vue';
import Ticker from './components/Ticker.vue';
import {
    buildAudiences,
    exampleExecutable,
    featuredPackageNames,
    minecraftRange,
    platformList,
    requirePackage,
    requirePackages,
    tickerItems
} from './landing';

const audiences = buildAudiences(project);
const latest = project.protocols[0];
const featured = requirePackages(project, featuredPackageNames);
const installExample = requirePackage(project, '@jsprismarine/nbt');
const executable = exampleExecutable(project);
const startCommand = `chmod +x ${executable}\n./${executable}`;
</script>

<template>
    <div class="landing">
        <header class="landing__hero">
            <p class="landing__eyebrow">
                <i></i>v{{ project.version }} · Minecraft {{ minecraftRange(project) }} · Protocol {{ latest.protocol }}
            </p>
            <h1>The Bedrock<br />server you <em>own.</em></h1>
            <div class="landing__copy">
                <p class="landing__lede">
                    A dedicated server for Minecraft: Bedrock Edition. One binary to host it, real packages to build on
                    it, and vanilla behavior driven by data, so it stays right when Bedrock moves.
                </p>
                <div class="landing__cta">
                    <BrandButton href="/guide/running#run-the-prebuilt-server">Run a server</BrandButton>
                    <BrandButton href="/guide/" variant="outline">Read the docs</BrandButton>
                </div>
                <p class="landing__meta">
                    {{ project.executables.length }} builds for {{ platformList(project, 'and') }}. No Node.js to
                    install.
                </p>
                <nav class="landing__jump" aria-label="Start where you are">
                    <span aria-hidden="true">Start as</span>
                    <a v-for="audience in audiences" :key="audience.id" :href="`#start-${audience.id}`">{{
                        audience.tab
                    }}</a>
                </nav>
            </div>
            <div class="landing__stage">
                <TerminalWindow>
                    <span class="t-line"><span class="t-prompt">$</span> ./{{ executable }}</span>
                    <span class="t-line"
                        ><span class="t-ok">[info]</span> Starting JSPrismarine server version v{{
                            project.version
                        }}
                        for Minecraft: Bedrock Edition on {{ project.protocols.length }} protocol version{{
                            project.protocols.length === 1 ? '' : 's'
                        }}:</span
                    >
                    <span v-for="(entry, index) in project.protocols" :key="entry.protocol" class="t-line">
                        protocol <span class="t-warn">{{ entry.protocol }}</span
                        >: <span class="t-warn">{{ entry.minecraft.join(', ') }}</span
                        ><span v-if="index === 0" class="t-dim"> (advertised in the MOTD)</span></span
                    >
                    <span class="t-line"
                        ><span class="t-ok">[info]</span> JSPrismarine is now listening on port
                        <span class="t-warn">{{ project.defaultPort }}</span></span
                    >
                    <span class="t-line"><span class="t-prompt">&gt;</span> <span class="t-cursor"></span></span>
                </TerminalWindow>
            </div>
            <PrismMark class="landing__prism" size="100%" />
        </header>

        <section class="landing__paths" aria-labelledby="paths">
            <h2 id="paths">Start where you are.</h2>
            <AudienceTabs :audiences="audiences" anchor="start" />
        </section>

        <BentoGrid>
            <BentoTile tone="accent">
                <div class="bento-figure">1</div>
                <p class="bento-caption">
                    <b>Executable</b>One file for {{ platformList(project) }}, with its runtime and data inside. Each
                    release ships {{ project.executables.length }} builds.
                    <a :href="project.releasesUrl">Download</a>
                </p>
            </BentoTile>
            <BentoTile tone="signal">
                <div class="bento-figure">{{ project.packages.length }}</div>
                <p class="bento-caption">
                    <b>Published packages</b>Protocol, transport, world and server, each on npm.
                </p>
            </BentoTile>
            <BentoTile tone="deep" :span="2">
                <p class="bento-caption">
                    <b>Take the pieces you need</b>Every package carries its own README and API reference.
                </p>
                <ul class="landing__packages">
                    <li v-for="pkg in featured" :key="pkg.name">
                        <a :href="`https://www.npmjs.com/package/${pkg.name}`" :title="pkg.description">{{
                            pkg.name
                        }}</a>
                    </li>
                    <li>
                        <a :href="withBase('/packages')">All {{ project.packages.length }}</a>
                    </li>
                </ul>
                <code class="landing__install">pnpm add {{ installExample.name }}</code>
            </BentoTile>
            <BentoTile :span="4">
                <p class="bento-caption">
                    <b>Parity, in public</b>Each family of vanilla behavior has a test and a row on the
                    <a :href="withBase('/parity')">tracker</a>.
                </p>
                <ParityBars />
            </BentoTile>
            <BentoTile v-if="releases.releases[0]" tone="accent" :span="6">
                <LatestRelease :release="releases.releases[0]" />
            </BentoTile>
        </BentoGrid>

        <Ticker :items="tickerItems" />

        <section class="landing__close" aria-labelledby="close">
            <div>
                <h2 id="close">Run it in a minute.</h2>
                <p>
                    Download the build for your system, make it executable and start it. Players connect on port
                    {{ project.defaultPort }}.
                </p>
                <div class="landing__cta">
                    <BrandButton :href="project.releasesUrl">Download v{{ project.version }}</BrandButton>
                    <BrandButton href="/guide/running" variant="outline">Read the guide</BrandButton>
                </div>
            </div>
            <div class="landing__command">
                <pre>{{ startCommand }}</pre>
                <CopyButton class="landing__copy-button" :text="startCommand" />
            </div>
        </section>
    </div>
</template>

<style scoped>
.landing {
    display: grid;
    /* minmax(0, 1fr) stops the ticker's unbroken line from widening the page on phones. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--jsp-gap);
    max-width: 1200px;
    padding: 10px 16px 24px;
    margin: 0 auto;
    color: var(--jsp-cream);
}

.landing__hero {
    display: grid;
    grid-template-areas:
        'eyebrow eyebrow'
        'title title'
        'copy prism'
        'stage prism';
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    column-gap: clamp(20px, 4vw, 48px);
    padding: clamp(16px, 3vw, 32px);
    overflow: hidden;
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-panel);
}

.landing__eyebrow {
    grid-area: eyebrow;
    margin: 0;
    font: 700 12px var(--vp-font-family-mono);
    color: var(--jsp-mint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.landing__eyebrow i {
    /* Inline, so the marker stays on the first line when the eyebrow wraps on a phone. */
    display: inline-block;
    margin-right: 10px;
    vertical-align: -1px;
    width: 10px;
    height: 10px;
    background: var(--jsp-signal);
}

.landing h1 {
    grid-area: title;
    margin: 18px 0 22px;
    font-size: clamp(44px, 10.5vw, 124px);
    font-weight: 800;
    line-height: 0.88;
    letter-spacing: -0.055em;
    color: var(--jsp-cream);
}

.landing h1 em {
    display: inline-block;
    padding: 0 0.12em;
    margin-left: -0.05em;
    font-style: normal;
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
    transform: rotate(-1.5deg);
}

.landing__copy {
    grid-area: copy;
}

.landing__lede {
    max-width: 46ch;
    margin: 0;
    font-size: clamp(16px, 2vw, 20px);
    color: var(--jsp-mint);
}

.landing__cta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin: 26px 0 14px;
}

.landing__meta {
    margin: 0 0 28px;
    font: 12px/1.5 var(--vp-font-family-mono);
    color: var(--jsp-mint);
}

.landing__jump {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: -14px 0 28px;
}

.landing__jump span {
    margin-right: 4px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-mint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.landing__jump a {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 16px;
    font-size: 15px;
    font-weight: 700;
    color: var(--jsp-cream);
    text-decoration: none;
    border: 2px solid color-mix(in srgb, var(--jsp-mint) 55%, transparent);
    border-radius: 99px;
}

.landing__jump a:hover {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
}

.landing__install {
    padding: 10px 12px;
    font: 13px var(--vp-font-family-mono);
    color: var(--jsp-term-text);
    background: var(--jsp-ink);
    border-radius: var(--jsp-radius-control);
}

.landing__stage {
    grid-area: stage;
    min-width: 0;
}

.landing__stage :deep(.terminal) {
    box-shadow: var(--jsp-shadow-offset) var(--jsp-shadow-offset) 0 var(--jsp-deep);
}

.landing__prism {
    grid-area: prism;
    align-self: center;
    justify-self: center;
    width: min(100%, 420px);
    height: auto;
}

.landing__paths {
    padding: clamp(16px, 3vw, 32px);
    color: var(--jsp-ink);
    background: var(--jsp-cream);
    border-radius: var(--jsp-radius-panel);
}

.landing__paths h2 {
    padding: 0;
    margin: 0;
    font-size: clamp(28px, 5vw, 52px);
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: -0.04em;
    color: inherit;
    border: 0;
}

.landing__packages {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0;
    margin: 0;
    list-style: none;
}

.landing__packages li {
    margin: 0;
}

.landing__packages a {
    display: block;
    overflow-wrap: anywhere;
    padding: 4px 8px;
    font: 12px var(--vp-font-family-mono);
    color: var(--jsp-mint);
    text-decoration: none;
    border: 1.5px solid var(--jsp-accent);
    border-radius: 6px;
}

.landing__packages a:hover {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
}

.landing :deep(.bento-caption code) {
    padding: 0;
    font-size: 0.9em;
    color: inherit;
    background: none;
}

.landing :deep(.bento-caption a) {
    font-weight: 800;
    color: inherit;
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
}

.landing__close {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    gap: clamp(20px, 4vw, 48px);
    align-items: center;
    padding: clamp(20px, 4vw, 48px) clamp(16px, 3vw, 32px);
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-panel);
}

.landing__close h2 {
    padding: 0;
    margin: 0 0 12px;
    font-size: clamp(32px, 5.5vw, 64px);
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: -0.045em;
    color: var(--jsp-cream);
    border: 0;
}

.landing__close p {
    max-width: 44ch;
    margin: 0;
    font-size: clamp(16px, 1.8vw, 18px);
    color: var(--jsp-mint);
}

.landing__close .landing__cta {
    margin-bottom: 0;
}

.landing__command {
    position: relative;
    min-width: 0;
    padding: 20px;
    background: var(--jsp-ink);
    border-radius: var(--jsp-radius-control);
}

.landing__command pre {
    padding-bottom: 36px;
    margin: 0;
    overflow-x: auto;
    font: 14px/1.8 var(--vp-font-family-mono);
    color: var(--jsp-term-text);
}

.landing__copy-button {
    position: absolute;
    right: 14px;
    bottom: 14px;
}

@media (max-width: 760px) {
    .landing__hero {
        grid-template-areas:
            'eyebrow'
            'title'
            'copy'
            'stage';
        grid-template-columns: minmax(0, 1fr);
    }

    /* The audience tabs follow the hero directly on a phone, so the shortcut row would only repeat them. */
    .landing__prism,
    .landing__jump {
        display: none;
    }

    .landing__close {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
