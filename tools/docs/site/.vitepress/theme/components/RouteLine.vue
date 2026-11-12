<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { onceInView, prefersReducedMotion } from '../motion';

/** One stop on a route. */
export interface RouteStop {
    /** The small line over the title: a date, "Step 2", "Closed". */
    label: string;
    title: string;
    body?: string;
    /** Where the stop's title links to, on a route that is not selectable. Site paths get the deploy base. */
    href?: string;
    /** A flagged stop is drawn as a diamond, to mark something the reader should know about it. */
    flagged?: boolean;
    /** A closed stop is a diamond too, the line past it is dashed, and the rider stops there. */
    closed?: boolean;
    /** A stop the route has not reached yet: its ring is dashed, and so is the line to it. */
    pending?: boolean;
    /** How large the stop's ring is against a plain one, so a bigger thing can be a bigger stop. */
    size?: number;
}

/**
 * A route drawn as a transit line: a row of stops and a rider on the line. It suits anything that happens
 * in order, such as the steps of a guide, a release history or a roadmap. The `stop` slot adds content
 * under a stop, such as a button.
 *
 * The line draws itself stop by stop when it scrolls into view, and the rider travels to where the route
 * rests: the first closed stop, or the last stop it has reached. With `selectable`, each stop is a button.
 * Pointing at one, focusing it or pressing it sends the rider there and sets `v-model`, so a page can show
 * that stop's detail beside the line. The line behind the rider is drawn in full and the line ahead of it
 * is faint.
 *
 * A wide route runs across; a narrow one runs down. Under reduced motion the whole route is simply there.
 */
const props = withDefaults(
    defineProps<{
        stops: RouteStop[];
        /** The line's color. Signal for the main route, accent for a second one beside it. */
        tone?: 'signal' | 'accent';
        selectable?: boolean;
    }>(),
    { tone: 'signal', selectable: false }
);
/** The selected stop's index, on a selectable route. Below zero, the rider rests where the route does. */
const selected = defineModel<number>({ default: -1 });

const list = useTemplateRef<HTMLElement>('list');
/** How many stops have arrived so far. */
const arrived = ref(0);
/** Where the rider is, in pixels from the first stop. */
const riderAt = ref({ x: 0, y: 0 });
/** Whether the rider has left the first stop; until then it waits there for the line to draw. */
const riding = ref(false);
/** Whether the route has started to draw; a stop added after that arrives at once. */
let drawn = false;
let timers: ReturnType<typeof setTimeout>[] = [];
let stopWatching: (() => void) | undefined;
let resizing: ResizeObserver | undefined;

/** The stop the route rests on: the first closed one, or the last one it has reached. */
const restStop = computed(() => {
    const closed = props.stops.findIndex((stop) => stop.closed);
    if (closed !== -1) return closed;
    return Math.max(
        0,
        props.stops.findLastIndex((stop) => !stop.pending)
    );
});
/** The stop the rider is on. */
const current = computed(() =>
    selected.value >= 0 && selected.value < props.stops.length ? selected.value : restStop.value
);

/** Moves the rider to the current stop, wherever the layout has put it. */
function place() {
    const stop = list.value?.children[current.value];
    if (stop instanceof HTMLElement) riderAt.value = { x: stop.offsetLeft, y: stop.offsetTop };
}

function select(index: number) {
    if (props.selectable) selected.value = index;
}

/** Arrow keys walk the route, in whichever direction it runs. */
function onKeydown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    const next = index + step;
    if (next < 0 || next >= props.stops.length) return;
    event.preventDefault();
    select(next);
    list.value?.children[next]?.querySelector('button')?.focus();
}

/** The line from a stop to the next is dashed when the route does not really run there. */
const dashed = (index: number) =>
    props.stops[index].closed || index >= restStop.value || props.stops[index + 1]?.pending;
/** Site paths get the deploy base; full URLs are left alone. */
const target = (href: string) => (/^[a-z]+:/i.test(href) ? href : withBase(href));

function draw() {
    drawn = true;
    if (prefersReducedMotion()) {
        arrived.value = props.stops.length;
        riding.value = true;
        return place();
    }
    timers = props.stops.map((_, index) => setTimeout(() => (arrived.value = index + 1), 80 + index * 170));
    // The rider sets off once the line has started to draw, and reaches its stop about when the line does.
    timers.push(
        setTimeout(() => {
            riding.value = true;
            place();
        }, 320)
    );
}

watch(current, place);
// A stop the page adds later has no timer to bring it in, so it is shown and the rider is placed again.
watch(
    () => props.stops.length,
    (count) => {
        if (!drawn) return;
        for (const timer of timers) clearTimeout(timer);
        arrived.value = count;
        riding.value = true;
        void nextTick(place);
    }
);

onMounted(() => {
    if (!list.value) return;
    stopWatching = onceInView(list.value, draw);
    // A route turns from across to down as its container narrows, and the rider has to follow.
    resizing = new ResizeObserver(() => riding.value && place());
    resizing.observe(list.value);
});
onBeforeUnmount(() => {
    stopWatching?.();
    resizing?.disconnect();
    for (const timer of timers) clearTimeout(timer);
});
</script>

<template>
    <div class="route" :class="[`is-${tone}`, { 'is-selectable': selectable }]">
        <ol ref="list" class="route__stops">
            <li
                v-for="(stop, index) in stops"
                :key="stop.title"
                class="route__stop"
                :class="{
                    'is-in': index < arrived,
                    'is-end': index === stops.length - 1,
                    'is-flagged': stop.flagged || stop.closed,
                    'is-pending': stop.pending,
                    'is-dashed': dashed(index),
                    'is-behind': index < current,
                    'is-current': index === current
                }"
                :style="{ '--size': stop.size ?? 1 }"
                @pointerenter="select(index)"
            >
                <i class="route__dot"></i>
                <button
                    v-if="selectable"
                    class="route__head"
                    type="button"
                    :aria-pressed="index === current"
                    @click="select(index)"
                    @focus="select(index)"
                    @keydown="onKeydown($event, index)"
                >
                    <span class="route__label">{{ stop.label }}</span>
                    <b class="route__title">{{ stop.title }}</b>
                </button>
                <div v-else class="route__head">
                    <span class="route__label">{{ stop.label }}</span>
                    <b class="route__title">
                        <a v-if="stop.href" :href="target(stop.href)">{{ stop.title }}</a>
                        <template v-else>{{ stop.title }}</template>
                    </b>
                </div>
                <p v-if="stop.body" class="route__body">{{ stop.body }}</p>
                <slot name="stop" :stop="stop" :index="index" />
            </li>
            <i
                class="route__rider"
                :class="{ 'is-riding': riding }"
                :style="{ translate: `${riderAt.x}px ${riderAt.y}px` }"
                aria-hidden="true"
            ></i>
        </ol>
    </div>
</template>

<style scoped>
/*
 * The route takes its colors from where it sits: its text color for the stops, and `--route-surface` for
 * the panel behind it, which fills the open stops' rings.
 */
.route {
    --route-surface: var(--jsp-deep);
    --route-line: var(--jsp-signal);
    --route-soft: color-mix(in srgb, currentColor 78%, var(--route-surface));
    --route-faint: color-mix(in srgb, currentColor 26%, var(--route-surface));
    --route-gap: 16px;
    container-type: inline-size;
}

.route.is-accent {
    --route-line: var(--jsp-accent);
}

.route__stops {
    position: relative;
    display: flex;
    gap: var(--route-gap);
    padding: 0;
    margin: 0;
    list-style: none;
}

.route__stop {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    padding-top: 40px;
    margin: 0;
}

.route__stop > :not(.route__dot) {
    opacity: 0;
    translate: 0 10px;
}

.route__stop.is-in > :not(.route__dot) {
    opacity: 1;
    translate: none;
    transition:
        opacity 0.3s,
        translate 0.6s var(--jsp-spring);
}

/*
 * The line from this stop to the next. It draws itself when the stop arrives. Behind the rider it is the
 * route's color; ahead of it, it is faint, so the rider leaves a trail as it moves.
 */
.route__stop::before {
    position: absolute;
    top: 6px;
    right: calc(var(--route-gap) * -1);
    left: 11px;
    height: 10px;
    content: '';
    background: var(--route-faint);
    transform: scaleX(0);
    transform-origin: 0 50%;
}

.route__stop.is-in::before {
    transform: none;
    transition:
        transform 0.45s cubic-bezier(0.22, 0.9, 0.24, 1),
        background-color 0.35s;
}

.route__stop.is-behind::before {
    background: var(--route-line);
}

.route__stop.is-end::before {
    display: none;
}

/* Where the route does not really run, the line is only dashes. */
.route__stop.is-dashed::before {
    background: repeating-linear-gradient(90deg, var(--route-faint) 0 10px, transparent 10px 18px);
}

/* A stop's ring sits on the line, centered on it, and grows from its middle with the stop's size. */
.route__dot {
    position: absolute;
    top: calc(11px - 11px * var(--size));
    left: calc(11px - 11px * var(--size));
    z-index: 1;
    width: calc(22px * var(--size));
    height: calc(22px * var(--size));
    background: var(--route-surface);
    border: 6px solid var(--route-soft);
    border-radius: 50%;
    scale: 0;
    transition:
        scale 0.6s var(--jsp-spring),
        border-color 0.3s;
}

.is-in > .route__dot {
    scale: 1;
}

.is-behind > .route__dot,
.is-current > .route__dot {
    border-color: currentColor;
}

/* A flagged or closed stop is a diamond in signal, whatever the line's color. */
.is-flagged > .route__dot {
    border-color: var(--jsp-signal);
    border-radius: 0;
    rotate: 45deg;
}

.is-pending > .route__dot {
    border-style: dashed;
    border-width: 3px;
}

.route__head {
    display: block;
    width: 100%;
    padding: 0;
    font: inherit;
    color: var(--route-soft);
    text-align: left;
    transition: color 0.25s;
}

button.route__head {
    cursor: pointer;
}

.is-current .route__head,
.route:not(.is-selectable) .route__head {
    color: inherit;
}

.route__label {
    display: block;
    margin-bottom: 4px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--route-soft);
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.route__title {
    display: block;
    margin-bottom: 6px;
    font-size: clamp(17px, 2.6cqw, 22px);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
}

.route__title a {
    color: inherit;
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
}

.route__body {
    margin: 0 0 10px;
    font-size: 14px;
    line-height: 1.45;
    color: var(--route-soft);
    overflow-wrap: anywhere;
}

/* The rider waits on the first stop while the line draws, then springs to wherever the route is read from. */
.route__rider {
    position: absolute;
    top: -5px;
    left: -5px;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    pointer-events: none;
    background: currentColor;
    border-radius: 50%;
}

.route__rider.is-riding {
    transition: translate 0.75s var(--jsp-spring);
}

.route__rider::after {
    width: 13px;
    height: 14px;
    content: '';
    background: var(--route-surface);
    clip-path: polygon(0 0, 100% 50%, 0 100%);
    translate: 1px 0;
}

/* Narrow, the line runs down the left and the stops stack beside it. */
@container (max-width: 640px) {
    .route__stops {
        --route-gap: 18px;
        flex-direction: column;
    }

    .route__stop {
        padding: 0 0 0 44px;
    }

    .route__stop::before {
        top: 11px;
        right: auto;
        bottom: calc(var(--route-gap) * -1);
        left: 6px;
        width: 10px;
        height: auto;
        transform: scaleY(0);
        transform-origin: 50% 0;
    }

    .route__stop.is-dashed::before {
        background: repeating-linear-gradient(180deg, var(--route-faint) 0 10px, transparent 10px 18px);
    }

    .route__rider::after {
        rotate: 90deg;
        translate: 0 1px;
    }

    button.route__head {
        min-height: var(--jsp-target);
    }
}

@media (prefers-reduced-motion: reduce) {
    .route__stop.is-in > :not(.route__dot),
    .route__stop.is-in::before,
    .route__dot,
    .route__rider.is-riding {
        transition: none;
    }
}
</style>
