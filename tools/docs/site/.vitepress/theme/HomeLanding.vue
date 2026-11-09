<script setup lang="ts">
import { withBase } from 'vitepress';

import { data as project } from '../../project.data.mts';
import { data as releases } from '../../releases.data.mts';
import AudienceTabs from './components/AudienceTabs.vue';
import BentoGrid from './components/BentoGrid.vue';
import BentoTile from './components/BentoTile.vue';
import BrandButton from './components/BrandButton.vue';
import LatestRelease from './components/LatestRelease.vue';
import ParityBars from './components/ParityBars.vue';
import PrismMark from './components/PrismMark.vue';
import TerminalWindow from './components/TerminalWindow.vue';
import Ticker from './components/Ticker.vue';
import { buildAudiences, featuredPackageNames, minecraftRange, requirePackages, tickerItems } from './landing';

const audiences = buildAudiences(project);
const latest = project.protocols[0];
const featured = requirePackages(project, featuredPackageNames);
</script>

<template>
    <div class="landing">
        <header class="landing__hero">
            <p class="landing__eyebrow">
                <i></i>v{{ project.version }} · Minecraft {{ minecraftRange(project) }} · Protocol {{ latest.protocol }}
            </p>
            <h1>The Bedrock<br />server you <em>own.</em></h1>
            <p class="landing__lede">
                One binary to host it. Real packages to build on it. Vanilla behavior driven by data, so it stays right
                when Bedrock moves.
            </p>
            <div class="landing__cta">
                <BrandButton href="/guide/running">Run a server</BrandButton>
                <BrandButton href="/guide/" variant="outline">Read the docs</BrandButton>
            </div>
            <div class="landing__stage">
                <TerminalWindow>
                    <span class="t-line"><span class="t-prompt">$</span> pnpm run start</span>
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
                <PrismMark class="landing__prism" size="100%" />
            </div>
        </header>

        <section class="landing__paths" aria-labelledby="paths">
            <h2 id="paths">Start where you are.</h2>
            <AudienceTabs :audiences="audiences" />
        </section>

        <BentoGrid>
            <BentoTile tone="accent">
                <div class="bento-figure">1</div>
                <p class="bento-caption">
                    <b>Executable</b><code>pnpm run package</code> builds <code>dist/prismarine</code>, a Node single
                    executable.
                </p>
            </BentoTile>
            <BentoTile tone="signal">
                <div class="bento-figure">{{ project.packages.length }}</div>
                <p class="bento-caption">
                    <b>Published packages</b>Protocol, transport, world and server, each on npm.
                </p>
            </BentoTile>
            <BentoTile tone="deep" :span="2">
                <ul class="landing__packages">
                    <li v-for="pkg in featured" :key="pkg.name">
                        <a :href="`https://www.npmjs.com/package/${pkg.name}`" :title="pkg.description">{{
                            pkg.name
                        }}</a>
                    </li>
                </ul>
                <p class="bento-caption">
                    <b>Take the pieces you need</b>Every package carries its own README and API reference.
                </p>
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
    </div>
</template>

<style scoped>
.landing {
    display: grid;
    /* minmax(0, 1fr) stops the ticker's unbroken line from widening the page on phones. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--jsp-gap);
    max-width: 1200px;
    padding: 10px 16px 64px;
    margin: 0 auto;
    color: var(--jsp-cream);
}

.landing__hero {
    padding: clamp(16px, 3vw, 32px) clamp(16px, 3vw, 32px) 0;
    overflow: hidden;
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-panel);
}

.landing__eyebrow {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 0;
    font: 700 12px var(--vp-font-family-mono);
    color: var(--jsp-accent);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.landing__eyebrow i {
    width: 10px;
    height: 10px;
    background: var(--jsp-signal);
}

.landing h1 {
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
    color: var(--jsp-forest);
    background: var(--jsp-accent);
    transform: rotate(-1.5deg);
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
    margin: 26px 0;
}

.landing__stage {
    display: grid;
    min-width: 0;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 20px;
    align-items: end;
}

.landing__stage :deep(.terminal) {
    border-radius: var(--jsp-radius-control) var(--jsp-radius-control) 0 0;
}

.landing__prism {
    align-self: center;
    justify-self: center;
    width: min(100%, 340px);
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
    padding: 4px 8px;
    font: 12px var(--vp-font-family-mono);
    color: var(--jsp-mint);
    text-decoration: none;
    border: 1.5px solid var(--jsp-accent);
    border-radius: 6px;
}

.landing__packages a:hover {
    color: var(--jsp-forest);
    background: var(--jsp-accent);
}

.landing :deep(.bento-caption code) {
    padding: 0;
    font-size: 0.9em;
    color: inherit;
    background: none;
}

.landing :deep(.bento-caption a) {
    color: var(--jsp-accent);
}

@media (max-width: 760px) {
    .landing__stage {
        grid-template-columns: minmax(0, 1fr);
    }

    .landing__prism {
        display: none;
    }
}
</style>
