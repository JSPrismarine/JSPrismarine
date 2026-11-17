/**
 * The level side of the script host's world seam: `ScriptWorld` from `@jsprismarine/script-host`,
 * implemented over one level, so its behavior pack scripts read and write it without holding a
 * world object ([ADR 0020](../../../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md)).
 *
 * A Bedrock world is a JSPrismarine level: one save whose dimensions are each a `World`. The
 * scripts see the level's dimensions, its players and its one weather.
 */
import type { Weather } from '@jsprismarine/engine-systems';
import type {
    ChatSendIntent,
    Guard,
    ScriptWeather,
    ScriptWorld,
    ScriptWorldEvent,
    WeatherChangeIntent
} from '@jsprismarine/script-host/host/world';

import type { ChatManager } from '../chat/ChatManager';
import type { WeatherChange, WorldWeather } from '../world/Weather';

/** A player of the level, as the scripts reach one. */
export interface ScriptWorldPlayer {
    /** The player's entity id, as the Script API writes it. */
    readonly id: string;
    /** Puts a line of chat on the player's screen. */
    sendMessage(message: string): void;
}

/** What {@link LevelScriptWorld} reads of its level. */
export interface ScriptWorldSources {
    /** The level's dimensions, as Bedrock names them, in stem order. */
    dimensions(): readonly string[];
    /** The players in the level, in the order they joined. */
    players(): readonly ScriptWorldPlayer[];
    /** The level's weather. */
    readonly weather: WorldWeather;
    /** The server's chat, whose guard stage a player's line goes past. */
    readonly chat: Pick<ChatManager, 'addGuard'>;
    /** The wall clock the input step admitted for the current tick, in milliseconds since the epoch. */
    clock(): number;
}

/** The dimension Bedrock renders weather in, and reports weather events for. */
const WEATHER_DIMENSION = 'minecraft:overworld';

const SCRIPT_WEATHER: Readonly<Record<Weather, ScriptWeather>> = { clear: 'Clear', rain: 'Rain', thunder: 'Thunder' };
const LEVEL_WEATHER: Readonly<Record<ScriptWeather, Weather>> = { Clear: 'clear', Rain: 'rain', Thunder: 'thunder' };

/** One level, as its behavior pack scripts see it. */
export class LevelScriptWorld implements ScriptWorld {
    private readonly sources: ScriptWorldSources;
    private readonly committed: ScriptWorldEvent[] = [];
    private readonly stopListening: () => void;

    /** Starts recording the level's weather changes for the scripts' after-events. */
    public constructor(sources: ScriptWorldSources) {
        this.sources = sources;
        this.stopListening = sources.weather.onChange(({ previous, current }) =>
            this.committed.push({
                type: 'weatherChange',
                dimension: WEATHER_DIMENSION,
                previousWeather: SCRIPT_WEATHER[previous],
                newWeather: SCRIPT_WEATHER[current]
            })
        );
    }

    /** The level's dimensions, as Bedrock names them. */
    public dimensions(): readonly string[] {
        return this.sources.dimensions();
    }

    /** The entity ids of the level's players. */
    public players(): readonly string[] {
        return this.sources.players().map((player) => player.id);
    }

    /** Puts a line of chat on the screen of every player in the level. */
    public sendMessage(message: string): void {
        for (const player of this.sources.players()) player.sendMessage(message);
    }

    /** The level's weather, in the Script API's names. */
    public weather(): ScriptWeather {
        return SCRIPT_WEATHER[this.sources.weather.current()];
    }

    /** Sets the level's weather; the dimension does not matter, as a level has one weather. */
    public setWeather(_dimension: string, weather: ScriptWeather, duration: number): void {
        this.sources.weather.set(LEVEL_WEATHER[weather], duration);
    }

    /** Adds a script guard to the level's weather action, translating the change both ways. */
    public guardWeather(guard: Guard<WeatherChangeIntent>): () => void {
        return this.sources.weather.addGuard((change: WeatherChange) => {
            const verdict = guard({
                dimension: WEATHER_DIMENSION,
                previousWeather: SCRIPT_WEATHER[change.previous],
                newWeather: SCRIPT_WEATHER[change.next],
                duration: change.duration
            });
            if (verdict.veto) return { veto: true };
            return {
                veto: false,
                change: {
                    previous: change.previous,
                    next: LEVEL_WEATHER[verdict.intent.newWeather],
                    duration: verdict.intent.duration
                }
            };
        });
    }

    /**
     * Adds a script guard to the chat of the level's players, under the ids the scripts know
     * them by. A line from a player in another level goes past it.
     */
    public guardChat(guard: Guard<ChatSendIntent>): () => void {
        return this.sources.chat.addGuard((intent) => {
            const sender = String(intent.sender);
            if (!this.players().includes(sender)) return { veto: false, intent };
            return guard({ sender, message: intent.message }).veto ? { veto: true } : { veto: false, intent };
        });
    }

    /** The weather changes since the last call, in the order they took effect. */
    public takeEvents(): readonly ScriptWorldEvent[] {
        return this.committed.splice(0);
    }

    /** The wall clock the input step admitted for this tick. */
    public clock(): number {
        return this.sources.clock();
    }

    /** Stops recording the level's changes. */
    public close(): void {
        this.stopListening();
    }
}
