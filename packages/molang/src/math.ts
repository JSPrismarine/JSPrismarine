/** A Molang math function: a pure numeric function over already-evaluated arguments. */
export interface MathFunction {
    /** Evaluates the function. Missing arguments read as 0, as Molang errors evaluate to 0. */
    evaluate: (args: readonly number[]) => number;
}

const DEGREES = 180 / Math.PI;

const arg = (args: readonly number[], index: number) => args[index] ?? 0;

const fn = (evaluate: (...args: number[]) => number): MathFunction => ({
    evaluate: (args) => {
        // Pass exactly the arity the function declares; absent arguments read as 0.
        const padded = Array.from({ length: evaluate.length }, (_, index) => arg(args, index));
        const value = evaluate(...padded);
        return Number.isFinite(value) ? value : 0;
    }
});

const randomFloat = (low: number, high: number) => low + Math.random() * (high - low);
// Uniform over the inclusive integer range; rounding a float draw would halve the endpoint odds.
const randomInteger = (low: number, high: number) => Math.floor(low + Math.random() * (high - low + 1));

const minAngle = (value: number) => {
    let angle = value % 360;
    if (angle >= 180) angle -= 360;
    if (angle < -180) angle += 360;
    return angle;
};

type EasingCurve = (t: number) => number;

const easeOutFrom =
    (easeIn: EasingCurve): EasingCurve =>
    (t) =>
        1 - easeIn(1 - t);
const easeInOutFrom =
    (easeIn: EasingCurve, easeOut: EasingCurve): EasingCurve =>
    (t) =>
        t < 0.5 ? easeIn(t * 2) / 2 : 0.5 + easeOut(t * 2 - 1) / 2;

const BACK_OVERSHOOT = 1.70158;

const easeInCurves = {
    back: (t) => (BACK_OVERSHOOT + 1) * t ** 3 - BACK_OVERSHOOT * t ** 2,
    bounce: (t) => 1 - easeOutBounce(1 - t),
    circ: (t) => 1 - Math.sqrt(1 - t ** 2),
    cubic: (t) => t ** 3,
    elastic: (t) => (t === 0 || t === 1 ? t : -(2 ** (10 * t - 10)) * Math.sin(((t * 10 - 10.75) * 2 * Math.PI) / 3)),
    expo: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
    quad: (t) => t ** 2,
    quart: (t) => t ** 4,
    quint: (t) => t ** 5,
    sine: (t) => 1 - Math.cos((t * Math.PI) / 2)
} satisfies Record<string, EasingCurve>;

function easeOutBounce(t: number): number {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) {
        const u = t - 1.5 / d1;
        return n1 * u * u + 0.75;
    }
    if (t < 2.5 / d1) {
        const u = t - 2.25 / d1;
        return n1 * u * u + 0.9375;
    }
    const u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
}

const ease = (curve: EasingCurve): MathFunction => fn((start, end, t) => start + (end - start) * curve(t));

const easeOutCurves = {
    back: easeOutFrom(easeInCurves.back),
    bounce: easeOutBounce,
    circ: easeOutFrom(easeInCurves.circ),
    cubic: easeOutFrom(easeInCurves.cubic),
    elastic: easeOutFrom(easeInCurves.elastic),
    expo: easeOutFrom(easeInCurves.expo),
    quad: easeOutFrom(easeInCurves.quad),
    quart: easeOutFrom(easeInCurves.quart),
    quint: easeOutFrom(easeInCurves.quint),
    sine: easeOutFrom(easeInCurves.sine)
} satisfies Record<keyof typeof easeInCurves, EasingCurve>;

const inOut = (name: keyof typeof easeInCurves) => ease(easeInOutFrom(easeInCurves[name], easeOutCurves[name]));

/**
 * The 61 documented `math.*` functions with Bedrock's semantics: trigonometry in degrees,
 * `sign(0)` is -1, `mod` keeps the dividend's sign like C `fmod`, `die_roll` sums `num` random
 * floats, and the 30 easing functions map `(start, end, t)` along the Penner curves.
 */
export const MATH_FUNCTIONS = {
    abs: fn(Math.abs),
    acos: fn((v) => Math.acos(v) * DEGREES),
    asin: fn((v) => Math.asin(v) * DEGREES),
    atan: fn((v) => Math.atan(v) * DEGREES),
    atan2: fn((y, x) => Math.atan2(y, x) * DEGREES),
    ceil: fn(Math.ceil),
    clamp: fn((v, min, max) => Math.min(Math.max(v, min), max)),
    copy_sign: fn((a, b) => Math.abs(a) * (b < 0 ? -1 : 1)),
    cos: fn((v) => Math.cos(v / DEGREES)),
    die_roll: fn((num, low, high) => {
        let total = 0;
        for (let i = 0; i < Math.floor(num); i++) total += randomFloat(low, high);
        return total;
    }),
    die_roll_integer: fn((num, low, high) => {
        let total = 0;
        for (let i = 0; i < Math.floor(num); i++) total += randomInteger(low, high);
        return total;
    }),
    exp: fn(Math.exp),
    floor: fn(Math.floor),
    hermite_blend: fn((t) => 3 * t ** 2 - 2 * t ** 3),
    inverse_lerp: fn((start, end, v) => (v - start) / (end - start)),
    lerp: fn((a, b, t) => a + (b - a) * t),
    lerprotate: fn((a, b, t) => minAngle(a + minAngle(b - a) * t)),
    ln: fn(Math.log),
    max: fn(Math.max),
    min: fn(Math.min),
    min_angle: fn(minAngle),
    mod: fn((v, d) => v % d),
    pi: fn(() => Math.PI),
    pow: fn((base, exponent) => base ** exponent),
    random: fn(randomFloat),
    random_integer: fn(randomInteger),
    round: fn(Math.round),
    sign: fn((v) => (v > 0 ? 1 : -1)),
    sin: fn((v) => Math.sin(v / DEGREES)),
    sqrt: fn(Math.sqrt),
    trunc: fn(Math.trunc),
    ease_in_back: ease(easeInCurves.back),
    ease_out_back: ease(easeOutCurves.back),
    ease_in_out_back: inOut('back'),
    ease_in_bounce: ease(easeInCurves.bounce),
    ease_out_bounce: ease(easeOutCurves.bounce),
    ease_in_out_bounce: inOut('bounce'),
    ease_in_circ: ease(easeInCurves.circ),
    ease_out_circ: ease(easeOutCurves.circ),
    ease_in_out_circ: inOut('circ'),
    ease_in_cubic: ease(easeInCurves.cubic),
    ease_out_cubic: ease(easeOutCurves.cubic),
    ease_in_out_cubic: inOut('cubic'),
    ease_in_elastic: ease(easeInCurves.elastic),
    ease_out_elastic: ease(easeOutCurves.elastic),
    ease_in_out_elastic: inOut('elastic'),
    ease_in_expo: ease(easeInCurves.expo),
    ease_out_expo: ease(easeOutCurves.expo),
    ease_in_out_expo: inOut('expo'),
    ease_in_quad: ease(easeInCurves.quad),
    ease_out_quad: ease(easeOutCurves.quad),
    ease_in_out_quad: inOut('quad'),
    ease_in_quart: ease(easeInCurves.quart),
    ease_out_quart: ease(easeOutCurves.quart),
    ease_in_out_quart: inOut('quart'),
    ease_in_quint: ease(easeInCurves.quint),
    ease_out_quint: ease(easeOutCurves.quint),
    ease_in_out_quint: inOut('quint'),
    ease_in_sine: ease(easeInCurves.sine),
    ease_out_sine: ease(easeOutCurves.sine),
    ease_in_out_sine: inOut('sine')
} as const satisfies Record<string, MathFunction>;

/** The name of a known `math.*` function. */
export type MathFunctionName = keyof typeof MATH_FUNCTIONS;
