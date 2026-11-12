<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import { onceInView, prefersReducedMotion } from '../motion';
import PassingLand from './PassingLand.vue';

/**
 * A cabin window with a blind. The default slot is printed on the blind's flat lower part; the `sky` slot is
 * what the sky says once the blind is up. The blind comes down when the window scrolls into view, and the
 * reader raises it with the tab, by pressing or dragging. The land outside only passes while the blind is
 * up, so nothing here moves unless the reader asked it to.
 */
const blind = useTemplateRef<HTMLElement>('blind');
const frame = useTemplateRef<HTMLElement>('frame');
/** The blind starts up, so there is something to bring down when the reader arrives. */
const up = ref(true);
/** How far the blind is lifted, in pixels below zero. */
const lift = ref(0);
const dragging = ref(false);
/** Whether the lift has been measured, so the first paint does not animate from the lowered place. */
const ready = ref(false);

/** How much of the raised blind still shows: its rail and a few slats. */
const SHOWING = 54;
const raisedLift = () => -((blind.value?.offsetHeight ?? 0) - SHOWING);

function set(next: boolean) {
    up.value = next;
    lift.value = next ? raisedLift() : 0;
}

let drag: { from: number; start: number; moved: boolean } | undefined;

function onPointerDown(event: PointerEvent) {
    drag = { from: lift.value, start: event.clientY, moved: false };
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
    if (!drag) return;
    const travel = event.clientY - drag.start;
    // A few pixels of travel is a press, not a pull.
    if (Math.abs(travel) > 4) drag.moved = true;
    if (!drag.moved) return;
    dragging.value = true;
    lift.value = Math.max(raisedLift(), Math.min(0, drag.from + travel));
}

/** Let go, and the blind goes to whichever end is nearer; a press without a pull switches ends. */
function onPointerUp() {
    if (!drag) return;
    dragging.value = false;
    set(drag.moved ? lift.value < raisedLift() / 2 : !up.value);
    drag = undefined;
}

function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    set(!up.value);
}

let stopWatching: (() => void) | undefined;
let lowering: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
    set(true);
    requestAnimationFrame(() => (ready.value = true));
    if (!frame.value) return;
    stopWatching = onceInView(frame.value, () => {
        lowering = setTimeout(() => set(false), prefersReducedMotion() ? 0 : 500);
    });
});
onBeforeUnmount(() => {
    stopWatching?.();
    clearTimeout(lowering);
});
</script>

<template>
    <div ref="frame" class="window-blind">
        <span class="window-blind__sun"></span>
        <PassingLand class="window-blind__land" :moving="up" :span="220" />
        <p class="window-blind__sky" :aria-hidden="!up"><slot name="sky" /></p>
        <div
            ref="blind"
            class="window-blind__blind"
            :class="{ 'is-up': up, 'is-dragging': dragging || !ready }"
            :style="{ '--lift': `${lift}px` }"
        >
            <div class="window-blind__say"><slot /></div>
            <button
                class="window-blind__tab"
                type="button"
                :aria-pressed="up"
                :aria-label="up ? 'Lower the blind' : 'Raise the blind'"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
                @keydown="onKeydown"
            >
                {{ up ? 'Lower' : 'Raise' }}
            </button>
        </div>
    </div>
</template>

<style scoped>
/* The window: upright and round-shouldered, in a frame, like the one beside an airplane seat. */
.window-blind {
    --frame: 12px;
    position: relative;
    /* How tall the window is, and how much of it the lowered blind covers: both are the page's to set. */
    min-height: var(--window-height, 480px);
    margin: var(--frame);
    overflow: hidden;
    color: var(--jsp-ink);
    background: var(--jsp-cream);
    border-radius: 150px;
    box-shadow: 0 0 0 var(--frame) var(--jsp-forest);
}

.window-blind__land {
    --land-rise: 2.9%;
    position: absolute;
    inset: 60% 0 0;
}

.window-blind__sun {
    position: absolute;
    top: 42%;
    left: 50%;
    width: clamp(70px, 30%, 116px);
    aspect-ratio: 1;
    background: var(--jsp-signal);
    border-radius: 50%;
    translate: -50% 0;
}

/* What the sky says once the blind is up. */
.window-blind__sky {
    position: absolute;
    inset: 27% 12% auto;
    margin: 0;
    font-size: clamp(26px, 3.4vw, 38px);
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: -0.045em;
    text-align: center;
}

/*
 * The blind: slats, the pitch printed across its flat lower part, a rail, and a tab to pull. It moves by
 * transform only, so raising it never re-lays the window.
 */
.window-blind__blind {
    position: absolute;
    inset: 0 0 auto;
    z-index: 2;
    height: var(--blind-cover, 66%);
    color: var(--jsp-on-accent);
    background: repeating-linear-gradient(
        180deg,
        var(--jsp-accent) 0 24px,
        color-mix(in srgb, var(--jsp-accent) 72%, var(--jsp-forest)) 24px 26px
    );
    border-bottom: 14px solid var(--jsp-forest);
    transform: translateY(var(--lift, 0px));
    transition: transform 0.9s var(--jsp-spring);
}

.window-blind__blind.is-dragging {
    transition: none;
}

.window-blind__say {
    position: absolute;
    inset: auto 12% 26px;
    display: grid;
    gap: 10px;
    transition: opacity 0.25s;
}

/* Rolled up, the blind shows its rail and a few slats, and its words are rolled up with it. */
.is-up .window-blind__say {
    visibility: hidden;
    opacity: 0;
    transition:
        opacity 0.25s,
        visibility 0s 0.25s;
}

.window-blind__tab {
    position: absolute;
    bottom: -60px;
    left: 50%;
    min-width: 96px;
    min-height: var(--jsp-target);
    padding: 0 16px;
    font: inherit;
    font-size: 15px;
    font-weight: 800;
    color: var(--jsp-ink);
    touch-action: none;
    cursor: grab;
    background: var(--jsp-cream);
    border: 2px solid var(--jsp-ink);
    border-radius: 99px;
    translate: -50% 0;
}

.is-dragging .window-blind__tab {
    cursor: grabbing;
}

/* The cord from the rail to the tab. */
.window-blind__tab::before {
    position: absolute;
    bottom: 100%;
    left: calc(50% - 1px);
    width: 2px;
    height: 16px;
    content: '';
    background: var(--jsp-ink);
}

@media (max-width: 720px) {
    .window-blind {
        border-radius: 120px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .window-blind__blind,
    .window-blind__say {
        transition: none;
    }
}
</style>
