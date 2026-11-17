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
    ScriptCommandResult,
    ScriptCommandSource,
    ScriptFormChannel,
    ScriptFormResponse,
    ScriptWeather,
    ScriptWorld,
    ScriptWorldEvent,
    VetoGuard,
    WeatherChangeIntent
} from '@jsprismarine/script-host/host/world';

import type { ChatManager } from '../chat/ChatManager';
import type { WeatherChange, WorldWeather } from '../world/Weather';

/** What the scripts read and write of a level's entities, blocks, items and commands. */
export type ScriptLevelAccess = Pick<
    ScriptWorld,
    | 'entity'
    | 'entities'
    | 'spawnEntity'
    | 'teleport'
    | 'kill'
    | 'remove'
    | 'setNameTag'
    | 'addTag'
    | 'removeTag'
    | 'inventory'
    | 'setInventoryItem'
    | 'heightRange'
    | 'block'
    | 'setBlock'
    | 'resolveBlock'
    | 'itemType'
    | 'runCommand'
>;

/** A level the scripts reach nothing of: no entities, no loaded blocks, no types and no commands. */
export const NO_LEVEL_ACCESS: ScriptLevelAccess = {
    entity: () => undefined,
    entities: () => [],
    spawnEntity: () => 'unknown-type',
    teleport: () => {},
    kill: () => false,
    remove: () => {},
    setNameTag: () => {},
    addTag: () => false,
    removeTag: () => false,
    inventory: () => undefined,
    setInventoryItem: () => {},
    heightRange: () => ({ min: -64, max: 320 }),
    block: () => undefined,
    setBlock: () => {},
    resolveBlock: () => undefined,
    itemType: () => undefined,
    runCommand: (command) => ({ error: `Unknown command: ${command}` })
};

/** A player of the level, as the scripts reach one. */
export interface ScriptWorldPlayer {
    /** The player's entity id, as the Script API writes it. */
    readonly id: string;
    /** The player's name. */
    readonly name?: string;
    /** Puts a line of chat on the player's screen. */
    sendMessage(message: string): void;
    /** Sends the player a form, as a `ModalFormRequestPacket`. A player without it is sent none. */
    showForm?(formId: number, json: string): void;
    /** Closes every form the player has open, as a `ClientboundCloseFormPacket`. */
    closeForms?(): void;
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
    /** The level's entities, blocks, items and commands. {@link NO_LEVEL_ACCESS} when absent. */
    readonly access?: ScriptLevelAccess;
    /**
     * Calls `listener` with a player's id as they leave, before their entity goes.
     * @returns A function that stops it.
     */
    onPlayerLeaving?(listener: (player: string) => void): () => void;
}

/** The dimension Bedrock renders weather in, and reports weather events for. */
const WEATHER_DIMENSION = 'minecraft:overworld';

const SCRIPT_WEATHER: Readonly<Record<Weather, ScriptWeather>> = { clear: 'Clear', rain: 'Rain', thunder: 'Thunder' };
const LEVEL_WEATHER: Readonly<Record<ScriptWeather, Weather>> = { Clear: 'clear', Rain: 'rain', Thunder: 'thunder' };

/** The id `/scriptevent` takes: a namespace other than `minecraft`, a colon and a name. */
const SCRIPT_EVENT_ID = /^(?!minecraft:)[^\s:]+:\S+$/;

/** One level, as its behavior pack scripts see it. */
export class LevelScriptWorld implements ScriptWorld {
    private readonly sources: ScriptWorldSources;
    private readonly access: ScriptLevelAccess;
    private readonly committed: ScriptWorldEvent[] = [];
    private readonly answers: ScriptFormResponse[] = [];
    private readonly stopListening: () => void;
    /** The players the scripts were last told about, by id, with their names. */
    private known = new Map<string, string>();

    /** The forms of the level's scripts, which travel to the level's players and back. */
    public readonly forms: ScriptFormChannel = {
        show: (player, formId, json) => this.player(player)?.showForm?.(formId, json),
        closeAll: (player) => this.player(player)?.closeForms?.(),
        takeResponses: () => this.answers.splice(0)
    };

    /** Starts recording the level's weather changes for the scripts' after-events. */
    public constructor(sources: ScriptWorldSources) {
        this.sources = sources;
        this.access = sources.access ?? NO_LEVEL_ACCESS;
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

    /** Puts a line of chat on the screen of every player in the level, or of one of them. */
    public sendMessage(message: string, to?: string): void {
        for (const player of this.sources.players())
            if (to === undefined || player.id === to) player.sendMessage(message);
    }

    /** Reads one entity of the level. */
    public entity(id: string): ReturnType<ScriptWorld['entity']> {
        return this.access.entity(id);
    }

    /** Every entity of one dimension. */
    public entities(dimension: string): ReturnType<ScriptWorld['entities']> {
        return this.access.entities(dimension);
    }

    /** Spawns an entity through the summon verb. */
    public spawnEntity(...args: Parameters<ScriptWorld['spawnEntity']>): ReturnType<ScriptWorld['spawnEntity']> {
        return this.access.spawnEntity(...args);
    }

    /** Moves an entity through the teleport verb. */
    public teleport(...args: Parameters<ScriptWorld['teleport']>): void {
        this.access.teleport(...args);
    }

    /** Kills an entity through the kill verb. */
    public kill(id: string): boolean {
        return this.access.kill(id);
    }

    /** Takes an entity out of its world. */
    public remove(id: string): void {
        this.access.remove(id);
    }

    /** Names an entity. */
    public setNameTag(id: string, nameTag: string): void {
        this.access.setNameTag(id, nameTag);
    }

    /** Adds a `/tag` tag to an entity. */
    public addTag(id: string, tag: string): boolean {
        return this.access.addTag(id, tag);
    }

    /** Takes a `/tag` tag off an entity. */
    public removeTag(id: string, tag: string): boolean {
        return this.access.removeTag(id, tag);
    }

    /** The slots of an entity's inventory. */
    public inventory(id: string): ReturnType<ScriptWorld['inventory']> {
        return this.access.inventory(id);
    }

    /** Sets one slot of an entity's inventory. */
    public setInventoryItem(...args: Parameters<ScriptWorld['setInventoryItem']>): void {
        this.access.setInventoryItem(...args);
    }

    /** A dimension's lowest block height and the height above its top. */
    public heightRange(dimension: string): ReturnType<ScriptWorld['heightRange']> {
        return this.access.heightRange(dimension);
    }

    /** Reads one block. */
    public block(...args: Parameters<ScriptWorld['block']>): ReturnType<ScriptWorld['block']> {
        return this.access.block(...args);
    }

    /** Sets one block. */
    public setBlock(...args: Parameters<ScriptWorld['setBlock']>): void {
        this.access.setBlock(...args);
    }

    /** Completes a block permutation. */
    public resolveBlock(...args: Parameters<ScriptWorld['resolveBlock']>): ReturnType<ScriptWorld['resolveBlock']> {
        return this.access.resolveBlock(...args);
    }

    /** Looks an item type up. */
    public itemType(typeId: string): ReturnType<ScriptWorld['itemType']> {
        return this.access.itemType(typeId);
    }

    /**
     * Runs a script's command. `/scriptevent` is answered here, since it only reaches scripts: an
     * id with a namespace other than `minecraft` commits a `scriptEvent`, and any other id
     * succeeds 0 times, as on BDS. Every other command goes to the server's commands.
     */
    public runCommand(command: string, source: ScriptCommandSource): ScriptCommandResult {
        const [name, id = '', ...message] = command.trim().split(' ');
        if (name !== 'scriptevent') return this.access.runCommand(command, source);
        if (!SCRIPT_EVENT_ID.test(id)) return { successCount: 0 };
        this.committed.push({
            type: 'scriptEvent',
            id,
            message: message.join(' '),
            sourceType: 'entity' in source ? 'Entity' : 'Server',
            ...('entity' in source ? { sourceEntity: source.entity } : {})
        });
        return { successCount: 1 };
    }

    /** Calls `listener` as a player leaves the level, before their entity goes. */
    public watchPlayerLeave(listener: (player: string) => void): () => void {
        return (
            this.sources.onPlayerLeaving?.((player) => {
                if (this.known.has(player)) listener(player);
            }) ?? (() => {})
        );
    }

    /**
     * Takes a client's answer to a form, as an input the input step admits; the next script
     * flush settles the form ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)).
     */
    public answerForm(response: ScriptFormResponse): void {
        this.answers.push(response);
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
    public guardChat(guard: VetoGuard<ChatSendIntent>): () => void {
        return this.sources.chat.addGuard((intent) => {
            const sender = String(intent.sender);
            if (!this.players().includes(sender)) return { veto: false, intent };
            return guard({ sender, message: intent.message }).veto ? { veto: true } : { veto: false, intent };
        });
    }

    /**
     * The changes since the last call, in the order they took effect, after the players who
     * left and joined since then: a player is told to the scripts as they first appear in the
     * level, and as gone once they no longer are.
     */
    public takeEvents(): readonly ScriptWorldEvent[] {
        const now = new Map(this.sources.players().map((player) => [player.id, player.name ?? ''] as const));
        const presence: ScriptWorldEvent[] = [];
        for (const [playerId, playerName] of this.known) {
            if (!now.has(playerId)) presence.push({ type: 'playerLeave', playerId, playerName });
        }
        for (const [playerId, playerName] of now) {
            if (this.known.has(playerId)) continue;
            presence.push({ type: 'playerJoin', playerId, playerName });
            presence.push({ type: 'playerSpawn', playerId, initialSpawn: true });
        }
        this.known = now;
        return [...presence, ...this.committed.splice(0)];
    }

    /** The wall clock the input step admitted for this tick. */
    public clock(): number {
        return this.sources.clock();
    }

    private player(id: string): ScriptWorldPlayer | undefined {
        return this.sources.players().find((player) => player.id === id);
    }

    /** Stops recording the level's changes. */
    public close(): void {
        this.stopListening();
    }
}
