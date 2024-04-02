/**
 * Timer/Performance measurement utility.
 *
 * @public
 */
export default class Timer {
    /**
     * The start time.
     */
    private startTime: [number, number];

    /**
     * The end time.
     */
    private endTime: [number, number] | undefined;

    public constructor() {
        this.startTime = process.hrtime();
    }

    /**
     * Reset the timer.
     */
    public reset() {
        this.startTime = process.hrtime();
        this.endTime = undefined!;
    }

    /**
     * Stop the timer.
     *
     * @returns The total duration in ms as a `float`
     */
    public stop(): number {
        this.endTime = process.hrtime(this.startTime);

        return this.getResult();
    }

    /**
     * Get the total duration.
     *
     * @returns The total duration in ms as a `float`
     */
    public getResult(): number {
        if (!this.endTime) throw new Error(`You need to stop the timer before getting the result.`);

        return Number.parseFloat(((this.endTime[0] * 1e9 + this.endTime[1]) / 1_000_000).toFixed(3));
    }
}
