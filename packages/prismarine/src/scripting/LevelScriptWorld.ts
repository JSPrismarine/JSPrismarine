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
    BlockBreakIntent,
    BlockInteractIntent,
    EntityInteractIntent,
    ChatSendIntent,
    ItemUseIntent,
    Guard,
    ScriptCommandResult,
    ScriptCommandSet,
    ScriptCommandSource,
    ScriptComponentSink,
    ScriptDebugShape,
    ScriptDebugShapeChange,
    ScriptEventSourceType,
    ScriptFormChannel,
    ScriptFormResponse,
    ScriptHttpChannel,
    ScriptLegacyStates,
    ScriptStructure,
    ScriptStructureStore,
    ScriptTransferTarget,
    ScriptWeather,
    ScriptWorld,
    ScriptWorldEvent,
    VetoGuard,
    WeatherChangeIntent,
    ScriptGameEventGuard
} from '@jsprismarine/script-host/host/world';
import type { ScriptEntitySystems } from '@jsprismarine/script-host/host/entities/world';
import { shapeVisibleTo } from '@jsprismarine/script-host/host/world';

import type { ChatManager } from '../chat/ChatManager';
import { legacyStatesOf } from './blocksItems/levelCatalog';
import { Scoreboard } from '../world/Scoreboard';
import type { ScriptEntityEvent } from './scriptEntityEvents';
import type { ScriptPlayerActions } from './scriptPlayerActions';
import type { ScriptWorldEvents } from './events/worldEvents';
import { scriptScoreboard } from './scriptScoreboard';
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
    | 'selectEntities'
    | 'simulatedPlayers'
    | 'placeStructure'
    | 'setGameMode'
    | 'setSelectedSlot'
    | 'applyDamage'
    | 'setSneaking'
    | 'showTitle'
    | 'playSound'
    | 'spawnParticle'
    | 'isEffectType'
    | 'effects'
    | 'addEffect'
    | 'removeEffect'
    | 'blockInventory'
    | 'setBlockInventoryItem'
    | 'equipment'
    | 'setEquipment'
    | 'attribute'
    | 'setAttribute'
    | 'effectTypes'
    | 'dimensionTypes'
    | 'dynamicProperties'
    | 'setDynamicProperties'
    | 'clearDynamicProperties'
    | 'scoreboard'
    | 'catalog'
    | 'blockLight'
    | 'waterlogged'
    | 'setWaterlogged'
    | 'worldSystem'
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
    runCommand: (command) => ({ error: `Unknown command: ${command}` }),
    // No entity is there, and the world's own properties and scores are not kept.
    dynamicProperties: (owner) => (owner === 'world' ? new Map() : undefined),
    setDynamicProperties: () => {},
    clearDynamicProperties: () => {},
    /** A new, empty scoreboard each time it is read, so no two users of this share one. */
    get scoreboard() {
        return scriptScoreboard(
            new Scoreboard(),
            () => undefined,
            () => undefined
        );
    }
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
    /** Sends the player to another server, as a `TransferPacket`. A player without it stays. */
    transfer?(target: ScriptTransferTarget): void;
    /** Draws, redraws or removes debug shapes, as a `PrimitiveShapesPacket`. A player without it sees none. */
    drawDebugShapes?(changes: readonly ScriptDebugShapeChange[]): void;
    /**
     * Whether the player's entity is in the level yet. A player who joined is told to the scripts at
     * once, and their first `playerSpawn` waits for this, since a script reads the player through
     * the entity. A player without it counts as spawned.
     */
    readonly spawned?: boolean;
}

/** What {@link LevelScriptWorld} reads of its level. */
export interface ScriptWorldSources {
    /** The level's dimensions, as Bedrock names them, in stem order. */
    dimensions(): readonly string[];
    /**
     * Adds a void dimension a script registered in `startup`; see
     * {@link ScriptWorld.registerCustomDimension}. Left out, the level takes no new dimension.
     */
    registerCustomDimension?(typeId: string): 'registered' | 'new-after-reload';
    /** The players in the level, in the order they joined. */
    players(): readonly ScriptWorldPlayer[];
    /** The level's weather. */
    readonly weather: WorldWeather;
    /**
     * The server's chat, whose guard stage a player's line goes past, and which tells who
     * listens of each line that went out.
     */
    readonly chat: Pick<ChatManager, 'addGuard'> & Partial<Pick<ChatManager, 'onSent'>>;
    /** The wall clock the input step admitted for the current tick, in milliseconds since the epoch. */
    clock(): number;
    /** The level's entities, blocks, items and commands. {@link NO_LEVEL_ACCESS} when absent. */
    readonly access?: ScriptLevelAccess;
    /** The channel the scripts' HTTP requests travel over. Without one, each request fails. */
    readonly http?: ScriptHttpChannel;
    /** The level's entity and player systems, which the entity members reach. */
    readonly entitySystems?: ScriptEntitySystems;
    /**
     * Calls `listener` with a player's id as they leave, before their entity goes.
     * @returns A function that stops it.
     */
    onPlayerLeaving?(listener: (player: string) => void): () => void;
    /**
     * Puts the scripts' custom commands into the server's command tree.
     * @returns A function that takes them out.
     */
    commands?(commands: ScriptCommandSet): () => void;
    /**
     * Sends the custom component hooks of the level's blocks and items to `sink`.
     * @returns A function that stops it.
     */
    components?(sink: ScriptComponentSink): () => void;
    /**
     * Calls `listener` with each entity that appears in the level, each blow that lands and each
     * death, once the world has kept it.
     * @returns A function that stops it.
     */
    entityEvents?(listener: (event: ScriptEntityEvent) => void): () => void;
    /** The item use and block breaking of the level's players. Without them, the scripts see neither. */
    readonly playerActions?: ScriptPlayerActions;
    /** The other world events of the level, which `scripting/events` raises. Without them, the scripts see none. */
    readonly worldEvents?: ScriptWorldEvents;
}

/** The order BDS sends the entity after-events of one flush in, whatever order they happened in. */
const ENTITY_EVENT_ORDER: Readonly<Record<ScriptEntityEvent['type'], number>> = {
    entitySpawn: 0,
    entityHurt: 1,
    entityDie: 2
};

const isEntityEvent = (event: ScriptWorldEvent): event is ScriptEntityEvent => event.type in ENTITY_EVENT_ORDER;

/**
 * Puts the entity events of a flush in BDS's order, every spawn, then every blow, then every
 * death, as the `entity-events` scenario recorded, and leaves the other events where they are.
 */
const inEntityEventOrder = (events: readonly ScriptWorldEvent[]): ScriptWorldEvent[] => {
    const entity = events.filter(isEntityEvent).sort((a, b) => ENTITY_EVENT_ORDER[a.type] - ENTITY_EVENT_ORDER[b.type]);
    return events.map((event) => (isEntityEvent(event) ? (entity.shift() ?? event) : event));
};

/** A structure store in memory, which keeps its structures in the order they were first set. */
const levelStructures = (): ScriptStructureStore => {
    const kept = new Map<string, ScriptStructure>();
    return {
        get: (id) => kept.get(id),
        set: (id, structure) => void kept.set(id, structure),
        delete: (id) => kept.delete(id),
        ids: () => [...kept.keys()]
    };
};

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
    /** The players the scripts were told joined, whose first `playerSpawn` waits for their entity. */
    private readonly unspawned = new Set<string>();
    /** The players in the level when the running script flush began; undefined between flushes. */
    private presentAtFlush: ReadonlySet<string> | undefined;
    /** The debug shapes the level's scripts draw now, by id. */
    private readonly shapes = new Map<number, ScriptDebugShape>();
    /** The players who were sent {@link LevelScriptWorld.shapes} and each change since. */
    private readonly shapeViewers = new Set<string>();

    /** The level's GameTest simulated players, when the server gives the scripts any. */
    public readonly simulatedPlayers: ScriptWorld['simulatedPlayers'];
    /** Places a GameTest's structure, when the server can. */
    public readonly placeStructure: ScriptWorld['placeStructure'];
    /** Sets a player's game mode, when the server can. */
    public readonly setGameMode: ScriptWorld['setGameMode'];
    /** Moves a player's hand to a hotbar slot, when the server can. */
    public readonly setSelectedSlot: ScriptWorld['setSelectedSlot'];
    /** Hurts an entity through the damage pipeline, when the server can. */
    public readonly applyDamage: ScriptWorld['applyDamage'];
    /** Makes an entity sneak or stand, when the server can. */
    public readonly setSneaking: ScriptWorld['setSneaking'];
    /** Shows a player a title, when the server can. */
    public readonly showTitle: ScriptWorld['showTitle'];
    /** Plays a sound, when the server can. */
    public readonly playSound: ScriptWorld['playSound'];
    /** Spawns a particle effect, when the server can. */
    public readonly spawnParticle: ScriptWorld['spawnParticle'];
    /** Whether the server knows a status effect, when it has effects. */
    public readonly isEffectType: ScriptWorld['isEffectType'];
    /** An entity's status effects, when the server has them. */
    public readonly effects: ScriptWorld['effects'];
    /** Adds a status effect to an entity, when the server can. */
    public readonly addEffect: ScriptWorld['addEffect'];
    /** Takes a status effect off an entity, when the server can. */
    public readonly removeEffect: ScriptWorld['removeEffect'];
    /** The slots of a block's container, when the server has block containers. */
    public readonly blockInventory: ScriptWorld['blockInventory'];
    /** Writes one slot of a block's container, when the server can. */
    public readonly setBlockInventoryItem: ScriptWorld['setBlockInventoryItem'];
    /** What an entity wears and holds, when the server has equipment. */
    public readonly equipment: ScriptWorld['equipment'];
    /** Writes one equipment slot, when the server can. */
    public readonly setEquipment: ScriptWorld['setEquipment'];
    /** One of an entity's attributes, when the server has them. */
    public readonly attribute: ScriptWorld['attribute'];
    /** Writes an entity's attribute, when the server can. */
    public readonly setAttribute: ScriptWorld['setAttribute'];
    /** The status effect types the server knows, when it has effects. */
    public readonly effectTypes: ScriptWorld['effectTypes'];
    /** The dimension types the level registers, when the server lists them. */
    public readonly dimensionTypes: ScriptWorld['dimensionTypes'];
    /** The server's block, item, enchantment and potion types, when the server has content. */
    public readonly catalog: ScriptWorld['catalog'];
    /** The light at a block, when the server lights its worlds. */
    public readonly blockLight: ScriptWorld['blockLight'];
    /** Whether a block holds water in its liquid layer, when the server keeps one. */
    public readonly waterlogged: ScriptWorld['waterlogged'];
    /** Puts water into a block's liquid layer or takes it out, when the server keeps one. */
    public readonly setWaterlogged: ScriptWorld['setWaterlogged'];
    /** The level's clock, spawn, difficulty, game rules and music. */
    public readonly worldSystem: ScriptWorld['worldSystem'];
    /**
     * The level's structures. They last as long as the level is loaded: a save does not keep them
     * yet, as BDS keeps a structure saved to the world.
     */
    public readonly structures: ScriptStructureStore = levelStructures();

    /** The channel the level's scripts' HTTP requests travel over, when the server gives one. */
    public readonly http: ScriptWorld['http'];

    /** The level's entity and player systems, when the server gives them. */
    public readonly entitySystems: ScriptWorld['entitySystems'];

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
        this.simulatedPlayers = this.access.simulatedPlayers;
        this.placeStructure = this.access.placeStructure;
        this.setGameMode = this.access.setGameMode;
        this.setSelectedSlot = this.access.setSelectedSlot;
        this.applyDamage = this.access.applyDamage;
        this.setSneaking = this.access.setSneaking;
        this.showTitle = this.access.showTitle;
        this.playSound = this.access.playSound;
        this.spawnParticle = this.access.spawnParticle;
        this.isEffectType = this.access.isEffectType;
        this.effects = this.access.effects;
        this.addEffect = this.access.addEffect;
        this.removeEffect = this.access.removeEffect;
        this.blockInventory = this.access.blockInventory;
        this.setBlockInventoryItem = this.access.setBlockInventoryItem;
        this.equipment = this.access.equipment;
        this.setEquipment = this.access.setEquipment;
        this.attribute = this.access.attribute;
        this.setAttribute = this.access.setAttribute;
        this.effectTypes = this.access.effectTypes;
        this.dimensionTypes = this.access.dimensionTypes;
        this.catalog = this.access.catalog;
        this.blockLight = this.access.blockLight;
        this.waterlogged = this.access.waterlogged;
        this.setWaterlogged = this.access.setWaterlogged;
        this.worldSystem = this.access.worldSystem;
        this.http = sources.http;
        this.entitySystems = sources.entitySystems;
        const stopWeather = sources.weather.onChange(({ previous, current }) =>
            this.committed.push({
                type: 'weatherChange',
                dimension: WEATHER_DIMENSION,
                previousWeather: SCRIPT_WEATHER[previous],
                newWeather: SCRIPT_WEATHER[current]
            })
        );
        const stopChat = sources.chat.onSent?.(({ sender, message }) => {
            const id = String(sender);
            if (this.players().includes(id)) this.committed.push({ type: 'chatSend', sender: id, message });
        });
        const stopEntities = sources.entityEvents?.((event) => this.committed.push(event));
        const stopActions = sources.playerActions?.events((event) => this.committed.push(event));
        const stopWorldEvents = sources.worldEvents?.events((event) => this.committed.push({ type: 'game', ...event }));
        this.stopListening = () => {
            stopWeather();
            stopChat?.();
            stopEntities?.();
            stopActions?.();
            stopWorldEvents?.();
        };
    }

    /** The level's dimensions, as Bedrock names them. */
    public dimensions(): readonly string[] {
        return this.sources.dimensions();
    }

    /** Adds a void dimension a script registered in `startup`. */
    public registerCustomDimension(typeId: string): 'registered' | 'new-after-reload' {
        return this.sources.registerCustomDimension?.(typeId) ?? 'registered';
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

    /** The states BDS reports for a block type beside the ones the level keeps. */
    public legacyStates(typeId: string): ScriptLegacyStates | undefined {
        return legacyStatesOf(typeId);
    }

    /** Looks an item type up. */
    public itemType(typeId: string): ReturnType<ScriptWorld['itemType']> {
        return this.access.itemType(typeId);
    }

    /** One pack's dynamic properties of the level or of an entity. */
    public dynamicProperties(
        ...args: Parameters<ScriptWorld['dynamicProperties']>
    ): ReturnType<ScriptWorld['dynamicProperties']> {
        return this.access.dynamicProperties(...args);
    }

    /** Writes some of one pack's dynamic properties of the level or of an entity. */
    public setDynamicProperties(...args: Parameters<ScriptWorld['setDynamicProperties']>): void {
        this.access.setDynamicProperties(...args);
    }

    /** Deletes one pack's dynamic properties of the level or of an entity. */
    public clearDynamicProperties(...args: Parameters<ScriptWorld['clearDynamicProperties']>): void {
        this.access.clearDynamicProperties(...args);
    }

    /** The level's scoreboard, which `/scoreboard` shares. */
    public get scoreboard(): ScriptWorld['scoreboard'] {
        return this.access.scoreboard;
    }

    /**
     * Runs a script's command. `/scriptevent` is answered here, since it only reaches scripts: an
     * id with a namespace other than `minecraft` commits a `scriptEvent`, and any other id
     * succeeds 0 times, as on BDS. Every other command goes to the server's commands.
     */
    public runCommand(command: string, source: ScriptCommandSource): ScriptCommandResult {
        const [name, id = '', ...message] = command.trim().split(' ');
        if (name !== 'scriptevent') return this.access.runCommand(command, source);
        const sent = this.scriptEvent(id, message.join(' '), 'entity' in source ? source.entity : undefined);
        return { successCount: sent ? 1 : 0 };
    }

    /** The entities a selector matches for a template's `selector` node; see {@link ScriptWorld.selectEntities}. */
    public selectEntities(selector: string, player: string | undefined): readonly string[] | undefined {
        return this.access.selectEntities?.(selector, player);
    }

    /**
     * Raises `system.afterEvents.scriptEventReceive` for a `/scriptevent`, from a script, the
     * console or a player.
     * @param sourceEntity - The id of the entity that ran it; the server when absent.
     * @returns False for an id `/scriptevent` refuses, which raises nothing.
     */
    public scriptEvent(id: string, message: string, sourceEntity?: string): boolean {
        if (!SCRIPT_EVENT_ID.test(id)) return false;
        const sourceType: ScriptEventSourceType = sourceEntity === undefined ? 'Server' : 'Entity';
        this.committed.push({
            type: 'scriptEvent',
            id,
            message,
            sourceType,
            ...(sourceEntity === undefined ? {} : { sourceEntity })
        });
        return true;
    }

    /** Calls `listener` as a player leaves the level, before their entity goes. */
    public watchPlayerLeave(listener: (player: string) => void): () => void {
        return (
            this.sources.onPlayerLeaving?.((player) => {
                if (this.known.has(player)) listener(player);
            }) ?? (() => {})
        );
    }

    /** Sends a player of the level to another server. */
    public transferPlayer(id: string, target: ScriptTransferTarget): void {
        this.player(id)?.transfer?.(target);
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

    /** Adds a script guard to the block breaking of the level's players. */
    public guardBlockBreak(guard: VetoGuard<BlockBreakIntent>): () => void {
        return this.sources.playerActions?.guardBlockBreak(guard) ?? (() => {});
    }

    /** Adds a script guard to the item use of the level's players. */
    public guardItemUse(guard: VetoGuard<ItemUseIntent>): () => void {
        return this.sources.playerActions?.guardItemUse(guard) ?? (() => {});
    }

    /** Adds a script guard to the block clicks of the level's players. */
    public guardBlockInteract(guard: VetoGuard<BlockInteractIntent>): () => void {
        return this.sources.playerActions?.guardBlockInteract(guard) ?? (() => {});
    }

    /** Adds a script guard to the actions the level's other before-events are about. */
    public guardGameEvents(guard: ScriptGameEventGuard): () => void {
        return this.sources.worldEvents?.guard(guard) ?? (() => {});
    }

    /** Adds a script guard to the entity clicks of the level's players. */
    public guardEntityInteract(guard: VetoGuard<EntityInteractIntent>): () => void {
        return this.sources.playerActions?.guardEntityInteract(guard) ?? (() => {});
    }

    /**
     * Marks the start of a script flush. A player who leaves while it runs, such as a simulated
     * player a script removes, is told to the scripts as gone in the next flush, as on BDS, whose
     * `players` scenario records the after-event a tick after the removal.
     */
    public beginFlush(): void {
        this.presentAtFlush = new Set(this.players());
    }

    /**
     * Marks the end of a script flush, and sends a player who has not seen the level's debug
     * shapes, such as one who joined since the last flush, every shape the level draws.
     */
    public endFlush(): void {
        this.presentAtFlush = undefined;
        const players = this.sources.players();
        const present = new Set(players.map((player) => player.id));
        for (const viewer of this.shapeViewers) if (!present.has(viewer)) this.shapeViewers.delete(viewer);
        const all = [...this.shapes].map(([id, shape]) => ({ id, shape }));
        for (const player of players) {
            if (this.shapeViewers.has(player.id)) continue;
            this.shapeViewers.add(player.id);
            const seen = all.filter(({ shape }) => shapeVisibleTo(shape, player.id));
            if (seen.length > 0) player.drawDebugShapes?.(seen);
        }
    }

    /**
     * Sends one flush's debug shape changes to every player who has seen the shapes so far. The
     * others get every shape at the end of the flush.
     */
    public drawDebugShapes(changes: readonly ScriptDebugShapeChange[]): void {
        for (const { id, shape } of changes) {
            if (shape === undefined) this.shapes.delete(id);
            else this.shapes.set(id, shape);
        }
        for (const player of this.sources.players()) {
            if (!this.shapeViewers.has(player.id)) continue;
            // A shape a player may not see goes out to them as one to stop drawing.
            player.drawDebugShapes?.(
                changes.map((change) =>
                    change.shape === undefined || shapeVisibleTo(change.shape, player.id) ? change : { id: change.id }
                )
            );
        }
    }

    /**
     * The changes since the last call, in the order they took effect, after the players who
     * left and joined since then: a player is told to the scripts as they first appear in the
     * level, and as gone once they no longer are.
     */
    public takeEvents(): readonly ScriptWorldEvent[] {
        this.sources.worldEvents?.poll();
        const players = this.sources.players();
        const now = new Map(players.map((player) => [player.id, player.name ?? ''] as const));
        const presence: ScriptWorldEvent[] = [];
        const leaving = new Map<string, string>();
        for (const [playerId, playerName] of this.known) {
            if (now.has(playerId)) continue;
            this.unspawned.delete(playerId);
            if (this.presentAtFlush?.has(playerId) === true) leaving.set(playerId, playerName);
            else presence.push({ type: 'playerLeave', playerId, playerName });
        }
        for (const player of players) {
            const playerId = player.id;
            if (!this.known.has(playerId)) {
                presence.push({ type: 'playerJoin', playerId, playerName: player.name ?? '' });
                this.unspawned.add(playerId);
            }
            if (!this.unspawned.has(playerId) || player.spawned === false) continue;
            this.unspawned.delete(playerId);
            presence.push({ type: 'playerSpawn', playerId, initialSpawn: true });
        }
        this.known = new Map([...now, ...leaving]);
        return [...presence, ...inEntityEventOrder(this.committed.splice(0))];
    }

    /** The wall clock the input step admitted for this tick. */
    public clock(): number {
        return this.sources.clock();
    }

    /** Puts the scripts' custom commands into the server's command tree, when the server has one. */
    public registerCommands(commands: ScriptCommandSet): () => void {
        return this.sources.commands?.(commands) ?? (() => {});
    }

    /** Sends the level's custom component hooks to the scripts, when the server raises them. */
    public bindComponents(sink: ScriptComponentSink): () => void {
        return this.sources.components?.(sink) ?? (() => {});
    }

    private player(id: string): ScriptWorldPlayer | undefined {
        return this.sources.players().find((player) => player.id === id);
    }

    /** Stops recording the level's changes. */
    public close(): void {
        this.stopListening();
    }
}
