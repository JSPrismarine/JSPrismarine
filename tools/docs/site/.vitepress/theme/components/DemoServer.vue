<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import type { DemoServer } from '../../../project.data.mts';
import BoardingPass from './BoardingPass.vue';
import BrandButton from './BrandButton.vue';
import PrismMark from './PrismMark.vue';
import WindowBlind from './WindowBlind.vue';

/**
 * The demo server's section on the landing page, as a seat on the way there: a cabin window whose blind
 * carries the pitch, and a boarding pass with the address, how to join, and a stub that is the host's
 * coupon. It is a full-width band, so it sets its own width and centers what it holds.
 */
const props = defineProps<{
    demo: DemoServer;
    /** The Minecraft releases that can join, such as `1.26.50 to 1.26.62`. */
    versions: string;
}>();

const pass = useTemplateRef<InstanceType<typeof BoardingPass>>('pass');

/**
 * Bedrock's `connect` deep link: it opens the game on this device and joins the server. Minecraft reports
 * no error when a link fails, so the pass also carries the address and where to type it.
 *
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/deep-links#connect
 */
const joinLink = computed(
    () => `minecraft://connect?serverUrl=${encodeURIComponent(props.demo.address)}&serverPort=${props.demo.port}`
);
/** The host's link as a reader would type it. */
const sponsorLabel = computed(() => props.demo.sponsor.url.replace(/^https?:\/\//, ''));
/** The barcode's bar widths, taken from the address and port two at a time, so the code is the address. */
const bars = computed(() =>
    [...`${props.demo.address}:${props.demo.port}`].flatMap((letter) => {
        const code = letter.charCodeAt(0);
        return [(code % 4) + 1, ((code >> 2) % 4) + 1];
    })
);

/** Copies the address and stamps the pass, the way a gate would. */
async function copy() {
    try {
        await navigator.clipboard.writeText(props.demo.address);
    } catch {
        return;
    }
    pass.value?.stamp('Copied');
}
</script>

<template>
    <section id="demo" class="demo" aria-label="The demo server">
        <div class="demo__inner">
            <WindowBlind class="demo__window">
                <!-- No id: the section carries it, so a doc page's outline does not pick this heading up. -->
                <h2>Visit the demo.</h2>
                <p>A JSPrismarine server anyone can join. Walk around, break things, and see what works.</p>
                <template #sky>Open to anyone.</template>
            </WindowBlind>

            <BoardingPass ref="pass" :stub-href="demo.sponsor.url">
                <div class="demo__carrier"><PrismMark :size="22" />JSPrismarine</div>
                <div class="demo__to">
                    <button
                        class="demo__address"
                        type="button"
                        :aria-label="`Copy the address, ${demo.address}`"
                        @click="copy"
                    >
                        {{ demo.address }}
                    </button>
                    <button class="demo__copy" type="button" @click="copy">Copy</button>
                </div>
                <dl class="demo__fields">
                    <div>
                        <dt>Port</dt>
                        <dd>{{ demo.port }}</dd>
                    </div>
                    <div>
                        <dt>Minecraft</dt>
                        <dd>{{ versions }}</dd>
                    </div>
                    <div>
                        <dt>Gate</dt>
                        <dd>Play, Servers, Add Server</dd>
                    </div>
                </dl>
                <BrandButton class="demo__join" :href="joinLink">Join in Minecraft</BrandButton>
                <p class="demo__hint">It opens Minecraft on this device and joins.</p>
                <div class="demo__barcode" aria-hidden="true">
                    <i v-for="(width, index) in bars" :key="index" :style="{ width: `${width}px` }"></i>
                </div>

                <template #stub>
                    <b class="demo__offer">{{ demo.sponsor.discount }} off</b>
                    <span class="demo__note"
                        >a server of your own at <u>{{ sponsorLabel }}</u></span
                    >
                    <span class="demo__note"
                        >{{ demo.sponsor.name }} provides part of the demo's hosting. Thank you. The coupon helps pay
                        for our test servers.</span
                    >
                </template>
            </BoardingPass>
        </div>
    </section>
</template>

<style scoped>
/* A full-width band: the page's deep surface from edge to edge, with the seat centered on it. */
.demo {
    padding: clamp(28px, 4vw, 52px) 0 clamp(4px, 1.5vw, 16px);
    color: var(--jsp-cream);
    background: var(--jsp-deep);
    /* A link to this section stops below the fixed header. */
    scroll-margin-top: var(--vp-nav-height);
}

/* The dark page is nearly ink, so the band gets a hairline above and below to stay a distinct block. */
.dark .demo {
    box-shadow:
        inset 0 1.5px 0 var(--jsp-dark-edge),
        inset 0 -1.5px 0 var(--jsp-dark-edge);
}

/* The window and the pass sit side by side, as close as a seat and its tray, and centered as a pair. */
.demo__inner {
    display: grid;
    /* Fixed tracks: the window with its frame, and the pass with its slot. Both give way on a narrow page. */
    grid-template-columns: minmax(0, 372px) minmax(0, 376px);
    gap: clamp(30px, 6vw, 88px);
    align-items: center;
    justify-content: center;
    width: min(820px, 100% - 32px);
    margin: 0 auto;
}

.demo__window {
    --window-height: 470px;
}

.demo h2 {
    padding: 0;
    margin: 0;
    font-size: clamp(34px, 4.2vw, 50px);
    font-weight: 800;
    line-height: 0.9;
    letter-spacing: -0.05em;
    color: inherit;
    border: 0;
}

.demo__window p {
    margin: 0;
    font-size: 16px;
    line-height: 1.45;
}

.demo__carrier {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.03em;
}

/* The address is plain print on the pass. Pressing it, or the pill beside it, copies it. */
.demo__to {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
}

.demo__address {
    min-width: 0;
    padding: 0 0 2px;
    font: 700 clamp(13px, 5.1cqw, 20px) / 1.1 var(--vp-font-family-mono);
    color: inherit;
    white-space: nowrap;
    cursor: pointer;
    background: none;
    border-bottom: 2px dashed var(--jsp-ink);
}

.demo__copy {
    flex: none;
    min-height: 30px;
    padding: 0 12px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-ink);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    border: 2px solid var(--jsp-ink);
    border-radius: 99px;
}

.demo__copy:hover {
    color: var(--jsp-cream);
    background: var(--jsp-ink);
}

.demo__fields {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 24px;
    margin: 0;
}

.demo__fields dt {
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.demo__fields dd {
    margin: 2px 0 0;
    font-size: 16px;
    font-weight: 800;
    line-height: 1.2;
}

/* The one primary action takes the pass's width, less the room its shadow needs. */
.demo__join {
    max-width: calc(100% - var(--jsp-shadow-offset));
    text-align: center;
}

.demo__hint,
.demo__note {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
}

.demo__hint {
    margin-top: -6px;
}

.demo__barcode {
    display: flex;
    gap: 2px;
    height: 24px;
    overflow: hidden;
}

.demo__barcode i {
    flex: none;
    background: var(--jsp-ink);
}

.demo__offer {
    font-size: clamp(40px, 16cqw, 56px);
    font-weight: 800;
    line-height: 0.88;
    letter-spacing: -0.05em;
}

.demo__note u {
    font-weight: 800;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
    overflow-wrap: anywhere;
}

/*
 * On a phone the two stack, and the pass comes down over the lower half of the window. The blind stays
 * where it is, so its tab is gone; the land shows in the strip under the blind and beside the pass.
 */
@media (max-width: 719px) {
    .demo {
        padding-bottom: 0;
    }

    .demo__inner {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
        justify-items: center;
    }

    .demo__window {
        --window-height: 430px;
        --blind-cover: 50%;
        width: min(420px, 100% - 24px);
    }

    .demo__window :deep(.window-blind__tab) {
        display: none;
    }

    .demo :deep(.pass) {
        --pass-width: 300px;
        position: relative;
        z-index: 3;
        margin-top: -190px;
    }
}
</style>
