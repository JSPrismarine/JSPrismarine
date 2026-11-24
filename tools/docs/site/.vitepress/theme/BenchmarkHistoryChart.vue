<script setup lang="ts">
import { computed } from 'vue';

/**
 * One panel of the benchmark history: a line per server across the runs, on a time axis the
 * page's panels share. Lines and grid are an SVG stretched over the plot; the marks, labels and
 * rules are HTML placed by percentage, so they keep their size at any width.
 */

/** A point on a line, already worded for its tooltip. */
export interface ChartPoint {
    readonly time: number;
    readonly value: number;
    readonly tip: string;
}

export interface ChartLine {
    readonly key: string;
    /** The `is-<server>` class that gives the line its color and the marks their shape. */
    readonly server: string;
    readonly label: string;
    readonly dashed: boolean;
    /** Runs of points drawn joined; a gap between two means their values do not compare. */
    readonly segments: readonly (readonly ChartPoint[])[];
}

/** A vertical rule at a run, such as a change of the runner's CPU. */
export interface ChartRule {
    readonly time: number;
    readonly label: string;
    readonly tip: string;
}

const props = defineProps<{
    readonly lines: readonly ChartLine[];
    /** `log` draws ratios around 1× so a halving and a doubling are the same distance. */
    readonly scale: 'linear' | 'log';
    readonly domain: readonly [number, number];
    readonly rules: readonly ChartRule[];
    /** A server drawn flat at 1×, the one a ratio panel divides by. */
    readonly reference?: { readonly server: string; readonly label: string } | null;
    readonly format: (value: number) => string;
    readonly label: string;
}>();

const values = computed(() => props.lines.flatMap((line) => line.segments.flat().map((point) => point.value)));

/** The y range, and the values to draw grid lines at. */
const axis = computed(() => {
    if (props.scale === 'log') {
        const logs = values.value.filter((value) => value > 0).map(Math.log2);
        // At least ½× to 2×, so a flat line near 1× does not fill the panel with noise.
        let low = Math.min(-1, ...logs);
        let high = Math.max(1, ...logs);
        const pad = (high - low) * 0.08;
        low -= pad;
        high += pad;
        const span = Math.ceil(high) - Math.floor(low);
        const step = span > 6 ? 2 : 1;
        const ticks: number[] = [];
        for (let power = Math.ceil(low); power <= Math.floor(high); power++) {
            if (power % step === 0) ticks.push(2 ** power);
        }
        return { low, high, ticks, at: (value: number) => Math.log2(value) };
    }
    const max = Math.max(0, ...values.value);
    // A step of 1, 2 or 5 times a power of ten, giving three or four grid lines.
    const rough = max / 3 || 1;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough)!;
    const high = Math.ceil((max * 1.05) / step) * step || step;
    const ticks: number[] = [];
    for (let tick = 0; tick <= high + step / 2; tick += step) ticks.push(tick);
    return { low: 0, high, ticks, at: (value: number) => value };
});

/** Percent from the bottom of the plot. */
const y = (value: number) => (100 * (axis.value.at(value) - axis.value.low)) / (axis.value.high - axis.value.low);
/** Percent from the left of the plot; a single run sits in the middle. */
const x = (time: number) => {
    const [start, end] = props.domain;
    return end === start ? 50 : (100 * (time - start)) / (end - start);
};

const tick = (value: number) =>
    props.scale === 'log' ? `${value < 1 ? `1/${1 / value}` : value}×` : props.format(value);
const polyline = (segment: readonly ChartPoint[]) =>
    segment.map((point) => `${x(point.time)},${100 - y(point.value)}`).join(' ');
</script>

<template>
    <figure class="hist-chart">
        <ul class="hist-key">
            <li v-for="line in lines" :key="line.key" :class="[`is-${line.server}`, { 'is-dashed': line.dashed }]">
                <i aria-hidden="true"></i>{{ line.label }}
            </li>
            <li v-if="reference" :class="[`is-${reference.server}`, 'is-reference']">
                <i aria-hidden="true"></i>{{ reference.label }}
            </li>
        </ul>
        <div class="hist-plot" role="img" :aria-label="label">
            <div class="hist-ticks" aria-hidden="true">
                <span
                    v-for="value in axis.ticks"
                    :key="value"
                    :class="{ 'is-one': scale === 'log' && value === 1 }"
                    :style="{ bottom: `${y(value)}%` }"
                    ><span>{{ tick(value) }}</span></span
                >
            </div>
            <div class="hist-area">
                <span
                    v-for="rule in rules"
                    :key="rule.time"
                    class="hist-rule"
                    :style="{ left: `${x(rule.time)}%`, '--tip-x': x(rule.time) }"
                    :data-tip="rule.tip"
                    ><b>{{ rule.label }}</b></span
                >
                <span
                    v-if="reference"
                    :class="`is-${reference.server}`"
                    class="hist-reference"
                    :style="{ bottom: `${y(1)}%` }"
                ></span>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <template v-for="line in lines" :key="line.key">
                        <polyline
                            v-for="(segment, index) in line.segments"
                            :key="index"
                            :class="[`is-${line.server}`, { 'is-dashed': line.dashed }]"
                            :points="polyline(segment)"
                        />
                    </template>
                </svg>
                <template v-for="line in lines" :key="line.key">
                    <template v-for="segment in line.segments">
                        <span
                            v-for="point in segment"
                            :key="point.time"
                            class="hist-hit"
                            :style="{
                                left: `${x(point.time)}%`,
                                bottom: `${y(point.value)}%`,
                                '--tip-x': x(point.time)
                            }"
                            :data-tip="point.tip"
                            ><i class="hist-point" :class="`is-${line.server}`"></i
                        ></span>
                    </template>
                </template>
            </div>
        </div>
    </figure>
</template>

<style scoped>
.hist-chart {
    display: grid;
    gap: 8px;
    margin: 0;
}

.hist-key {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    padding: 0;
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    list-style: none;
}

.hist-key li {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    margin: 0;
}

/* A short stroke for each line, dashed where the line is, so the key reads without color. */
.hist-key i {
    width: 18px;
    height: 0;
    border-top: 2.5px solid var(--bench-color);
}

.hist-key .is-dashed i,
.hist-key .is-reference i {
    border-top-style: dashed;
}

.hist-plot {
    position: relative;
    height: 168px;
    margin-left: var(--hist-gutter, 68px);
    background: var(--jsp-deep);
    border-radius: 4px;
}

/* Inset so a mark at either end or edge stays inside the plot. */
.hist-area {
    position: absolute;
    inset: 10px;
}

/* The grid shares the inset area's coordinates, and its labels hang out into the margin. */
.hist-ticks {
    position: absolute;
    inset: 10px 0;
}

.hist-ticks > span {
    position: absolute;
    right: 0;
    left: 0;
    height: 0;
    border-top: 1px solid color-mix(in srgb, var(--jsp-track) 60%, transparent);
}

.hist-ticks > .is-one {
    border-top-color: var(--jsp-track);
}

.hist-ticks span span {
    position: absolute;
    right: calc(100% + 8px);
    font: 12px/1 var(--vp-font-family-mono);
    color: var(--jsp-mint);
    white-space: nowrap;
    transform: translateY(-50%);
}

.hist-area svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
}

polyline {
    fill: none;
    stroke: var(--bench-color);
    stroke-width: 2px;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
}

polyline.is-dashed {
    stroke-dasharray: 5 4;
}

.hist-reference {
    position: absolute;
    right: 0;
    left: 0;
    height: 0;
    border-top: 2px dashed var(--bench-color);
}

/* A change of runner CPU: the spot color for what needs a look but has not failed. The rule is
   a dashed line down the middle of a wider hover target. */
.hist-rule {
    position: absolute;
    top: -10px;
    bottom: -10px;
    width: 12px;
    margin-left: -6px;
}

.hist-rule::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 5.25px;
    content: '';
    border-left: 1.5px dashed var(--jsp-warning);
}

.hist-rule b {
    position: absolute;
    top: 2px;
    left: 10px;
    font: 700 11px/1 var(--vp-font-family-mono);
    color: var(--jsp-warning);
}

/* Each mark sits in a hit target wider than itself, which also carries the tooltip. */
.hist-hit {
    position: absolute;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    margin: 0 0 -12px -12px;
}

.hist-point {
    width: 10px;
    height: 10px;
    background: var(--bench-color);
    outline: 1.5px solid var(--jsp-deep);
}

.hist-point.is-jsprismarine-nethernet,
.hist-point.is-jsprismarine-raknet {
    border-radius: 50%;
}

.hist-point.is-jsprismarine-raknet {
    background: var(--jsp-deep);
    box-shadow: inset 0 0 0 2.5px var(--bench-color);
}

.hist-point.is-bds {
    transform: rotate(45deg) scale(0.85);
}

/* The hover layer: each mark and rule names its run, its commit and its value. The tooltip
   slides along its mark by the mark's position across the plot, left edge on the mark at the
   start and right edge on it at the end, so it never reaches past the chart. */
.hist-hit::after,
.hist-rule::after {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    z-index: 2;
    display: none;
    width: max-content;
    max-width: min(240px, 70vw);
    padding: 6px 9px;
    font: 12px/1.4 var(--vp-font-family-mono);
    color: var(--jsp-cream);
    white-space: pre-line;
    pointer-events: none;
    content: attr(data-tip);
    background: var(--jsp-ink);
    border-radius: 6px;
    transform: translateX(calc(var(--tip-x, 50) * -1%));
}

.hist-rule::after {
    top: 22px;
    bottom: auto;
}

.hist-hit:hover::after,
.hist-rule:hover::after {
    display: block;
}
</style>
