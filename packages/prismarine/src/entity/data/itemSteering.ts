/**
 * Java's `ItemBasedSteering`: the boost a pig or a strider takes when its rider uses the item it
 * steers with.
 */

/** The shortest boost, in ticks: `ItemBasedSteering.boost` draws `140 + nextInt(841)`. */
export const MIN_BOOST_TICKS = 140;

/** How many more ticks a boost may draw on top of {@link MIN_BOOST_TICKS}. */
export const BOOST_TICK_RANGE = 841;

/** How much a boost adds to the ridden speed at its peak, `ItemBasedSteering.boostFactor`'s 1.15. */
const BOOST_PEAK = 1.15;

/** One mount's boost. */
export class ItemSteering {
    private boostTime = 0;
    private boostTimeTotal = 0;
    private active = false;

    /** Whether a boost is running. */
    public get boosting(): boolean {
        return this.active;
    }

    /** How long the running boost lasts in all, in ticks, or 0 when none runs. */
    public get boostTicks(): number {
        return this.active ? this.boostTimeTotal : 0;
    }

    /**
     * Starts a boost unless one is running, `ItemBasedSteering.boost`.
     *
     * @param nextInt - Draws a whole number in [0, bound).
     * @returns Whether a boost started.
     */
    public boost(nextInt: (bound: number) => number): boolean {
        if (this.active) return false;
        this.active = true;
        this.boostTime = 0;
        this.boostTimeTotal = MIN_BOOST_TICKS + nextInt(BOOST_TICK_RANGE);
        return true;
    }

    /** Advances the running boost one tick, as `ItemBasedSteering.tickBoost` does. */
    public tick(): void {
        if (!this.active) return;
        this.boostTime += 1;
        if (this.boostTime > this.boostTimeTotal) this.active = false;
    }

    /** The share of the ridden speed the boost gives now, `ItemBasedSteering.boostFactor`. */
    public boostFactor(): number {
        return this.active ? 1 + BOOST_PEAK * Math.sin((this.boostTime / this.boostTimeTotal) * Math.PI) : 1;
    }
}
