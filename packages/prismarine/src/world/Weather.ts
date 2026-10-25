/**
 * One world's weather: the cycle, what a client is told about it, and what reaches disk.
 *
 * The rules are `@jsprismarine/engine-systems`' - Java's `ServerLevel.advanceWeatherCycle`
 * over `WeatherData`, three counters and two flags - and nothing about them is repeated here.
 * This is the half that needs a world: whether the cycle runs at all, which is the
 * `doWeatherCycle` game rule, when to tell the clients, and the five numbers `level.json`
 * keeps between one run and the next.
 *
 * Sending is the awkward part and the reason this is a module rather than four fields on
 * {@link import('./World').World}. Bedrock has no "here is the weather" packet: there are four
 * level events, two to start each kind and two to stop it, and a client that was not listening
 * when one went out never learns. So the current state goes out again on the time sync's
 * cadence, which is what makes a player who just joined see the rain they are standing in.
 */
import { CLEAR_WEATHER, advanceWeatherCycle, weatherCommandState, weatherOf } from '@jsprismarine/engine-systems';
import type { Weather, WeatherState } from '@jsprismarine/engine-systems';
import { LevelEvent } from '@jsprismarine/minecraft';

/**
 * The intensity a level event carries, which the client reads as a fraction of this.
 *
 * Java fades its rain in over a hundred ticks through a float per level. Nothing here carries
 * a partial level, so the rain is either falling or not and the client is told the full
 * amount.
 */
const FULL_INTENSITY = 65535;

/** What {@link WorldWeather} needs from the world it belongs to. */
export interface WeatherWorld {
    /** Whether `doWeatherCycle` is on. Java stops the counters dead when it is not. */
    cycleAllowed(): boolean;
    /** A draw in `[0, bound)`, used only when a stretch has to be booked. */
    randomInt(bound: number): number;
    /** Sends a level event to everybody in the world. */
    broadcast(event: LevelEvent, data: number): void;
}

/** The weather as `level.json` holds it, which is Java's `WeatherData` field for field. */
export type SavedWeather = WeatherState;

/** Whether a value read back out of `level.json` is a weather record this can use. */
export const savedWeatherOf = (value: unknown): SavedWeather | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;

    // Parsed JSON, which the compiler cannot see the shape of; every field is checked.
    const record: Record<string, unknown> = value as Record<string, unknown>;
    const number = (name: string): number | undefined =>
        typeof record[name] === 'number' && Number.isFinite(record[name]) ? Math.max(0, record[name]) : undefined;

    const clearWeatherTime = number('clearWeatherTime');
    const rainTime = number('rainTime');
    const thunderTime = number('thunderTime');
    if (clearWeatherTime === undefined || rainTime === undefined || thunderTime === undefined) return undefined;
    if (typeof record['raining'] !== 'boolean' || typeof record['thundering'] !== 'boolean') return undefined;

    return { clearWeatherTime, rainTime, thunderTime, raining: record['raining'], thundering: record['thundering'] };
};

/** How often the current weather goes out again, so a player who just joined is told. */
const RESEND_INTERVAL_TICKS = 20;

/** The weather of one world. */
export class WorldWeather {
    private state: WeatherState = CLEAR_WEATHER;

    private announced: Weather = 'clear';

    public constructor(private readonly world: WeatherWorld) {}

    /** The five numbers, for the save file. */
    public saved(): SavedWeather {
        return this.state;
    }

    /** What the rules branch on: `clear`, `rain` or `thunder`. */
    public current(): Weather {
        return weatherOf(this.state);
    }

    /** Whether rain is falling from the sky right now, before anything about one position. */
    public raining(): boolean {
        return this.state.raining;
    }

    /**
     * Puts back what a save held.
     *
     * Nothing is announced: a world being loaded has nobody in it, and the first tick after
     * it does sends the state anyway.
     */
    public restore(saved: SavedWeather | undefined): void {
        if (saved === undefined) return;

        this.state = saved;
        this.announced = weatherOf(saved);
    }

    /**
     * One game tick: advances the cycle and keeps the clients in step.
     *
     * @param tick - The world's tick counter, which paces the resend.
     */
    public tick(tick: number): void {
        if (this.world.cycleAllowed()) {
            this.state = advanceWeatherCycle(this.state, (bound) => this.world.randomInt(bound));
        }

        const now = weatherOf(this.state);
        if (now !== this.announced) {
            this.announce(this.announced, now);
            this.announced = now;
            return;
        }

        if (tick % RESEND_INTERVAL_TICKS === 0) this.announce('clear', now);
    }

    /**
     * What `/weather <kind> [duration]` sets, announced at once rather than on the next tick.
     *
     * The seam the command needs, and the whole of it: a host wires
     * `world.setWeather(kind, durationTicks)` to its `/weather` and nothing else.
     *
     * @param kind - `clear`, `rain` or `thunder`.
     * @param durationTicks - How long, in ticks. Left out, each kind gets Java's own
     *   randomized default: 10 to 150 minutes clear, 10 to 20 raining, 3 to 13 storming.
     */
    public set(kind: Weather, durationTicks?: number): void {
        this.state = weatherCommandState(kind, (bound) => this.world.randomInt(bound), durationTicks);

        const now = weatherOf(this.state);
        this.announce(this.announced, now);
        this.announced = now;
    }

    /**
     * Tells every client what the sky is doing.
     *
     * Bedrock has a start and a stop event per kind and no way to set both at once, so going
     * from a storm to clear skies is two events and the order matters: the client keeps a
     * lightning level of its own, and stopping the rain without stopping the storm leaves it
     * flashing over a blue sky.
     */
    private announce(from: Weather, to: Weather): void {
        if (from === 'thunder' && to !== 'thunder') this.world.broadcast(LevelEvent.STOP_THUNDERSTORM, 0);
        if (from !== 'clear' && to === 'clear') this.world.broadcast(LevelEvent.STOP_RAINING, 0);

        if (to !== 'clear') this.world.broadcast(LevelEvent.START_RAINING, FULL_INTENSITY);
        if (to === 'thunder') this.world.broadcast(LevelEvent.START_THUNDERSTORM, FULL_INTENSITY);
    }
}
