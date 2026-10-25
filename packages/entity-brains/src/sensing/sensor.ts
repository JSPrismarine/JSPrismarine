/**
 * Sensors: the only writers of the memories a behavior reads about the world.
 *
 * A sensor scans on a fixed interval rather than every tick, and its first scan is offset by a
 * random amount so a herd of mobs does not scan in lockstep. Java registers 24 in
 * `minecraft:sensor_type`; `src/sensing/sensors.ts` carries all 24.
 */

import type { MemoryModuleType } from '../memory.js';
import type { BrainContext } from '../world.js';

/** Java's `Sensor.DEFAULT_SCAN_RATE`. */
export const DEFAULT_SCAN_RATE = 20;

/** Java's `Sensor.DEFAULT_TARGETING_RANGE`, the range before `minecraft:follow_range` overrides it. */
export const DEFAULT_TARGETING_RANGE = 16;

/**
 * A sensor. Java's abstract `Sensor`.
 *
 * {@link Sensor.tick} is final in Java and is here too: it owns the countdown, and
 * {@link Sensor.doTick} is the hook.
 */
export abstract class Sensor {
    /** The Java class name, which is what a debug read-out shows. */
    public abstract readonly name: string;

    /** Every memory the sensor writes. The brain registers each one when the sensor is added. */
    public abstract readonly requires: readonly MemoryModuleType<unknown>[];

    private timeToTick = 0;

    public constructor(public readonly scanRate: number = DEFAULT_SCAN_RATE) {}

    /** Java's `randomlyDelayStart`: offsets the first scan into `[0, scanRate)`. */
    public randomlyDelayStart(randomInt: (bound: number) => number): void {
        this.timeToTick = randomInt(this.scanRate);
    }

    /** Counts down and scans when the countdown reaches zero. */
    public tick(context: BrainContext): void {
        if (--this.timeToTick > 0) {
            return;
        }
        this.timeToTick = this.scanRate;
        this.doTick(context);
    }

    protected abstract doTick(context: BrainContext): void;
}
