/**
 * One world's weather: the cycle, what a client is told about it, and what reaches disk.
 *
 * The rules are `@jsprismarine/engine-systems`' - Java's `ServerLevel.advanceWeatherCycle`
 * over `WeatherData`, three counters and two flags - and nothing about them is repeated here.
 * This is the half that needs a world: whether the cycle runs at all, which is the
 * `doWeatherCycle` game rule, when to tell the clients, and the five numbers the provider
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

/** The weather stored by the provider, which is Java's `WeatherData` field for field. */
export type SavedWeather = WeatherState;

/** Whether a value read from world storage is a weather record this can use. */
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

/** A weather change about to happen, as the guards of the weather action read it. */
export interface WeatherChange {
    readonly previous: Weather;
    readonly next: Weather;
    /** How long the new weather lasts, in ticks. */
    readonly duration: number;
}

/**
 * A guard of the weather action ([ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)):
 * it reads the change and lets it through, with a weather and a duration it may replace, or
 * vetoes it. It writes nothing.
 */
export type WeatherGuard = (
    change: WeatherChange
) => { readonly veto: true } | { readonly veto: false; readonly change: WeatherChange };

/** Hears every weather change that took effect, whatever made it: a command, a script or the cycle. */
export type WeatherListener = (change: { readonly previous: Weather; readonly current: Weather }) => void;

/** How long the weather a state is in lasts, in ticks. */
const durationOf = (state: WeatherState): number => {
    const kind = weatherOf(state);
    if (kind === 'clear') return state.clearWeatherTime;
    return kind === 'rain' ? state.rainTime : state.thunderTime;
};

/** How often the current weather goes out again, so a player who just joined is told. */
const RESEND_INTERVAL_TICKS = 20;

/** The weather of one world. */
export class WorldWeather {
    private state: WeatherState = CLEAR_WEATHER;

    private announced: Weather = 'clear';

    private readonly guards: WeatherGuard[] = [];

    private readonly listeners: WeatherListener[] = [];

    public constructor(private readonly world: WeatherWorld) {}

    /**
     * Adds a guard to the weather action, after the ones already there. A change that keeps the
     * weather as it is goes past no guard.
     * @returns A function that removes it.
     */
    public addGuard(guard: WeatherGuard): () => void {
        this.guards.push(guard);
        return () => {
            const index = this.guards.indexOf(guard);
            if (index >= 0) this.guards.splice(index, 1);
        };
    }

    /**
     * Hears each change of weather once it took effect.
     * @returns A function that removes the listener.
     */
    public onChange(listener: WeatherListener): () => void {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) this.listeners.splice(index, 1);
        };
    }

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
            const previous = weatherOf(this.state);
            this.state = advanceWeatherCycle(this.state, (bound) => this.world.randomInt(bound));
            this.changed(previous);
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
     * A change of weather goes through the guards first, in the order they were added, and the
     * first veto leaves the weather as it was; a guard may also replace the weather and the
     * duration. Setting the weather it already is changes only how long it lasts.
     *
     * @param kind - `clear`, `rain` or `thunder`.
     * @param durationTicks - How long, in ticks. Left out, each kind gets Java's own
     *   randomized default: 10 to 150 minutes clear, 10 to 20 raining, 3 to 13 storming.
     */
    public set(kind: Weather, durationTicks?: number): void {
        const randomInt = (bound: number): number => this.world.randomInt(bound);
        const previous = weatherOf(this.state);
        let state = weatherCommandState(kind, randomInt, durationTicks);
        if (kind !== previous && this.guards.length > 0) {
            const proposed: WeatherChange = { previous, next: kind, duration: durationOf(state) };
            let change = proposed;
            for (const guard of this.guards) {
                const verdict = guard(change);
                if (verdict.veto) return;
                change = verdict.change;
            }
            if (change.next !== proposed.next || change.duration !== proposed.duration) {
                state = weatherCommandState(change.next, randomInt, change.duration);
            }
        }
        this.state = state;

        const now = weatherOf(this.state);
        this.announce(this.announced, now);
        this.announced = now;
        this.changed(previous);
    }

    /** Tells the listeners when the weather is no longer what it was. */
    private changed(previous: Weather): void {
        const current = weatherOf(this.state);
        if (current === previous) return;
        for (const listener of [...this.listeners]) listener({ previous, current });
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
