/**
 * Returns the zero-based tick where two entity AI digest traces first differ.
 * A missing digest at the end of the shorter trace counts as a divergence.
 */
export const firstDivergentTick = (original: readonly string[], replay: readonly string[]): number | undefined => {
    const tickCount = Math.max(original.length, replay.length);
    for (let tick = 0; tick < tickCount; tick += 1) {
        if (original[tick] !== replay[tick]) return tick;
    }
    return undefined;
};
