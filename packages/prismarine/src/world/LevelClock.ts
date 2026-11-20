/**
 * A level's two clocks: the game time, Bedrock's `currentTick`, and the time of day, its `Time`.
 *
 * The game time counts every tick the level runs and never stops, since scheduled block ticks
 * are due by it. The time of day is what the sun, `/time` and the overworld's script clock read.
 * It stands still while `minecraft:advance_time` is off or a script paused the clock, and
 * `/time set` moves it alone, so it is kept as an offset from the game time: a tick the day does
 * not advance takes one off.
 */
export class LevelClock {
    private gameTime = 0;
    private dayTimeOffset = 0;
    private paused = false;

    /**
     * @param dayAdvances - Whether the time of day moves on this tick, apart from a script's
     *   pause; the level answers it from `minecraft:advance_time`.
     */
    public constructor(private readonly dayAdvances: () => boolean) {}

    /** Runs one tick: the game time advances, and the time of day with it unless it is held. */
    public tick(): void {
        this.gameTime++;
        if (this.paused || !this.dayAdvances()) this.dayTimeOffset--;
    }

    /** The game time in ticks. */
    public getGameTime(): number {
        return this.gameTime;
    }

    /** Sets the game time. The time of day moves with it. */
    public setGameTime(time: number): void {
        this.gameTime = time;
    }

    /** The time of day in ticks, which runs with the game time except while it is held still. */
    public getDayTime(): number {
        return this.gameTime + this.dayTimeOffset;
    }

    /** Sets the time of day. The game time keeps its count. */
    public setDayTime(time: number): void {
        this.dayTimeOffset = time - this.gameTime;
    }

    /** Whether a script paused the clock. */
    public isPaused(): boolean {
        return this.paused;
    }

    /** Pauses or resumes the time of day, apart from the `minecraft:advance_time` rule. */
    public setPaused(paused: boolean): void {
        this.paused = paused;
    }
}
