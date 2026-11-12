<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import { onceInView, prefersReducedMotion } from '../motion';

/**
 * An upright pass and the printer it comes out of. The default slot is the pass's body and the `stub` slot
 * is its tear-off stub, which is a link to `stubHref`.
 *
 * The pass prints when it scrolls into view: it comes down out of the slot bottom edge first, in feeds,
 * then lets go and hangs clear. After that it behaves like paper in the hand. It leans toward the pointer
 * and lifts, and the stub tears off along the perforation when pointed at, focused or tapped. Torn off, the
 * stub sits nearer the reader than the body, so the two move apart as the pointer moves.
 *
 * Under reduced motion the pass is simply there, out of the slot, and nothing leans or drifts.
 */
defineProps<{ stubHref: string }>();

const root = useTemplateRef<HTMLElement>('root');
const feed = useTemplateRef<HTMLElement>('feed');
const ticket = useTemplateRef<HTMLElement>('ticket');
const paper = useTemplateRef<HTMLElement>('paper');
const body = useTemplateRef<HTMLElement>('body');
const stub = useTemplateRef<HTMLAnchorElement>('stub');

const printing = ref(false);
/** Whether the pass has left the slot, so its mouth no longer hides anything. */
const released = ref(false);
const stampText = ref('');
/** Changes on every stamp, so the same word can land twice. */
const stampCount = ref(0);

/** Lands a stamp on the pass's body, such as "Copied". */
function stamp(text: string) {
    stampText.value = text;
    stampCount.value += 1;
}
defineExpose({ stamp });

/*
 * Everything the paper does after it leaves the slot is one set of springs, stepped once a frame: the lean,
 * the lift, the drift with the pointer, how far the stub has come off, and how far out of the slot the pass
 * is. None of it is a CSS transition, so no two rules ever hand a property to each other mid-move.
 */
const springs = ['rx', 'ry', 'lift', 'px', 'py', 'torn', 'out'] as const;
type Spring = (typeof springs)[number];
const rest = (): Record<Spring, number> => ({ rx: 0, ry: 0, lift: 0, px: 0, py: 0, torn: 0, out: 0 });
const now = rest();
const goal = rest();
const speed = rest();
let frame = 0;
let still = false;
/** Whether a touch has just torn the stub, before its press has begun. */
let touchTore = false;
/** Whether the press now in progress is the touch that tore the stub. */
let pressTore = false;
let moves: Animation[] = [];
const cleanups: (() => void)[] = [];

function draw() {
    if (!paper.value || !body.value || !stub.value) return;
    paper.value.style.transform = `perspective(900px) rotateX(${now.rx}deg) rotateY(${now.ry}deg)`;
    body.value.style.transform = `translate(${now.px * 5}px, ${now.py * 4 - now.lift * 6}px)`;
    // Torn off, the stub sits nearer the reader, so it travels further with the pointer and hangs lower.
    const depth = now.torn;
    const x = now.px * (5 + 15 * depth) + depth * 12;
    const y = now.py * (4 + 11 * depth) + depth * 30 - now.lift * 6;
    stub.value.style.transform = `translate(${x}px, ${y}px) rotate(${depth * 5 + now.px * depth * 2.5}deg)`;
    // A hard shadow, as on the primary button: it grows as the paper lifts, and the stub's is longer.
    const shade = (extra: number) =>
        `drop-shadow(${(5 + 6 * now.lift + extra) * now.out}px ${(7 + 9 * now.lift + extra * 1.4) * now.out}px 0 var(--jsp-ink))`;
    body.value.style.filter = shade(0);
    stub.value.style.filter = shade(5 * depth);
}

function step() {
    let busy = false;
    for (const key of springs) {
        // The tear is a looser spring than the lean, so the stub swings a little before it hangs.
        const [pull, drag] = key === 'torn' ? [0.07, 0.8] : [0.1, 0.74];
        speed[key] = (speed[key] + (goal[key] - now[key]) * pull) * drag;
        now[key] += speed[key];
        if (Math.abs(speed[key]) > 0.0004 || Math.abs(goal[key] - now[key]) > 0.0004) busy = true;
    }
    draw();
    frame = busy ? requestAnimationFrame(step) : 0;
}

function wake() {
    if (!frame) frame = requestAnimationFrame(step);
}

/** The pointer anywhere in the pass's section moves the paper; over the pass itself it also leans and lifts. */
function onPointerMove(event: PointerEvent) {
    if (goal.out < 1 || !feed.value || !paper.value) return;
    const box = feed.value.getBoundingClientRect();
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    const x = clamp((event.clientX - (box.left + box.width / 2)) / (box.width / 2));
    const y = clamp((event.clientY - (box.top + box.height / 2)) / (box.height / 2));
    const over = event.target instanceof Node && paper.value.contains(event.target);
    Object.assign(goal, { px: x, py: y, ry: x * (over ? 8 : 2.5), rx: -y * (over ? 6 : 2), lift: over ? 1 : 0 });
    wake();
}

function onPointerLeave() {
    Object.assign(goal, { px: 0, py: 0, rx: 0, ry: 0, lift: 0 });
    wake();
}

/** Tears the stub off. It stays off. */
function tear(event?: Event) {
    if (goal.torn || goal.out < 1) return;
    goal.torn = 1;
    touchTore = event instanceof PointerEvent && event.pointerType === 'touch';
    if (still) {
        now.torn = 1;
        return draw();
    }
    // A tug the other way first, the way paper gives before it parts.
    speed.torn = -0.035;
    wake();
}

/**
 * A touch enters the stub, and so tears it, before its press begins. The press that follows is marked as
 * the one that tore it, however long it is held.
 */
function onStubPress() {
    pressTore = touchTore;
    touchTore = false;
}

/** Before the pass is out, the stub is not a link yet; on a touch screen the tap that tears it off stops there. */
function onStubClick(event: MouseEvent) {
    if (goal.out < 1 || pressTore) event.preventDefault();
    pressTore = false;
}

/** Prints the pass: it comes down in feeds with a short hold between them, then lets go of the slot. */
function print() {
    if (!ticket.value) return;
    if (still) {
        ticket.value.style.transform = 'translateY(30px) rotate(-1.5deg)';
        released.value = true;
        goal.out = now.out = 1;
        return draw();
    }
    printing.value = true;
    const feeds = 9;
    const keyframes: Keyframe[] = [
        { transform: 'translateY(-101%)', offset: 0, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' }
    ];
    for (let n = 1; n <= feeds; n++) {
        const at = `translateY(${-101 + (101 * n) / feeds}%)`;
        // Each feed moves for two thirds of its time and holds for the rest.
        keyframes.push(
            { transform: at, offset: (n - 0.34) / feeds, easing: 'linear' },
            { transform: at, offset: n / feeds, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' }
        );
    }
    const fed = ticket.value.animate(keyframes, { duration: 2100, fill: 'forwards' });
    moves.push(fed);
    fed.finished
        .then(() => {
            if (!ticket.value) return;
            // The paper's top is level with the slot's mouth now, so opening the mouth changes nothing on screen.
            printing.value = false;
            released.value = true;
            const spring = getComputedStyle(ticket.value).getPropertyValue('--jsp-spring').trim() || 'ease-out';
            moves.push(
                ticket.value.animate(
                    { transform: ['translateY(0) rotate(0deg)', 'translateY(30px) rotate(-1.5deg)'] },
                    { duration: 900, easing: spring, fill: 'forwards' }
                )
            );
            goal.out = 1;
            wake();
        })
        // A cancelled print, on unmount, has nothing left to do.
        .catch(() => undefined);
}

onMounted(() => {
    if (!root.value) return;
    still = prefersReducedMotion();
    cleanups.push(onceInView(root.value, print));
    if (still || !window.matchMedia('(hover: hover)').matches) return;
    // The section the pass sits in is the field the pointer moves it from.
    const field = root.value.closest('section') ?? root.value;
    field.addEventListener('pointermove', onPointerMove);
    field.addEventListener('pointerleave', onPointerLeave);
    cleanups.push(() => {
        field.removeEventListener('pointermove', onPointerMove);
        field.removeEventListener('pointerleave', onPointerLeave);
    });
});
onBeforeUnmount(() => {
    for (const cleanup of cleanups) cleanup();
    for (const move of moves) move.cancel();
    moves = [];
    cancelAnimationFrame(frame);
});
</script>

<template>
    <div ref="root" class="pass" :class="{ 'is-printing': printing }">
        <div class="pass__slot"></div>
        <div ref="feed" class="pass__feed" :class="{ 'is-released': released }">
            <div ref="ticket" class="pass__ticket">
                <div ref="paper" class="pass__paper">
                    <div ref="body" class="pass__piece">
                        <div class="pass__sheet">
                            <slot />
                            <!-- The stamp is for the eye and is replaced to land again; the words are spoken from a region that stays. -->
                            <span
                                :key="stampCount"
                                class="pass__stamp"
                                :class="{ 'is-on': stampCount }"
                                aria-hidden="true"
                                >{{ stampText }}</span
                            >
                            <span class="visually-hidden" aria-live="polite">{{ stampText }}</span>
                        </div>
                    </div>
                    <a
                        ref="stub"
                        class="pass__piece is-stub"
                        :href="stubHref"
                        target="_blank"
                        rel="sponsored noopener"
                        @pointerenter="tear"
                        @pointerdown="onStubPress"
                        @focus="tear"
                        @click="onStubClick"
                    >
                        <span class="pass__sheet"><slot name="stub" /></span>
                    </a>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/*
 * The printer: a slot with a light, and room under it for the pass to hang and the stub to fall.
 * `--pass-width` is how wide the paper is; the slot is a little wider than what comes out of it.
 */
.pass {
    --pass-width: 340px;
    display: grid;
    justify-items: center;
    align-content: start;
    width: min(var(--pass-width) + 36px, 100%);
    padding: 12px 0 48px;
}

.pass__slot {
    position: relative;
    z-index: 3;
    width: 100%;
    height: 16px;
    background: var(--jsp-forest);
    border-radius: 99px;
}

.pass__slot::after {
    position: absolute;
    top: 5px;
    right: 16px;
    width: 6px;
    height: 6px;
    content: '';
    background: color-mix(in srgb, var(--jsp-mint) 45%, var(--jsp-forest));
    border-radius: 50%;
}

/* The light blinks while the printer feeds. */
.is-printing .pass__slot::after {
    background: var(--jsp-signal);
    animation: pass-light 0.24s steps(2) infinite;
}

@keyframes pass-light {
    50% {
        opacity: 0.25;
    }
}

/* The mouth of the slot: it hides the paper above it and nothing else. */
.pass__feed {
    width: min(var(--pass-width), 100% - 24px);
    margin-top: -8px;
    clip-path: inset(0 -80px -400px -80px);
}

.pass__feed.is-released {
    clip-path: none;
}

/* The pass sizes its own type, so an address fits whatever width the column gives it. */
.pass__ticket {
    container-type: inline-size;
    transform: translateY(-101%);
    will-change: transform;
}

.pass__paper {
    color: var(--jsp-ink);
    will-change: transform;
}

.pass__piece {
    position: relative;
    display: block;
    color: inherit;
    text-decoration: none;
    will-change: transform, filter;
}

.pass__sheet {
    position: relative;
    display: grid;
    gap: 14px;
    align-content: start;
    padding: 20px 20px 24px;
    background: var(--jsp-cream);
    border-radius: var(--jsp-radius-panel) var(--jsp-radius-panel) 0 0;
    /* Half a hole along the tear line, every sixteen pixels; the other half is on the stub. */
    -webkit-mask: radial-gradient(circle 5px at 50% 100%, #0000 96%, #000) 0 0 / 16px 100% repeat-x;
    mask: radial-gradient(circle 5px at 50% 100%, #0000 96%, #000) 0 0 / 16px 100% repeat-x;
}

.is-stub .pass__sheet {
    gap: 8px;
    padding: 24px 20px 20px;
    background: var(--jsp-signal);
    border-radius: 0 0 var(--jsp-radius-panel) var(--jsp-radius-panel);
    -webkit-mask-image: radial-gradient(circle 5px at 50% 0, #0000 96%, #000);
    mask-image: radial-gradient(circle 5px at 50% 0, #0000 96%, #000);
}

/* A stamp lands on the pass when something on it is copied. */
.pass__stamp {
    position: absolute;
    top: 16px;
    right: 18px;
    padding: 3px 12px;
    font: 700 19px var(--vp-font-family-mono);
    color: var(--jsp-forest);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    pointer-events: none;
    background: var(--jsp-cream);
    border: 3px double var(--jsp-forest);
    border-radius: 6px;
    opacity: 0;
    rotate: -11deg;
}

.pass__stamp.is-on {
    opacity: 1;
    animation: pass-stamp 0.45s var(--jsp-spring);
}

@keyframes pass-stamp {
    from {
        opacity: 0;
        scale: 2.6;
    }
}

@media (prefers-reduced-motion: reduce) {
    .is-printing .pass__slot::after,
    .pass__stamp.is-on {
        animation: none;
    }
}
</style>
