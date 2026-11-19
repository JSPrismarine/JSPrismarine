/**
 * A {@link ScriptWorld} in memory for the host's tests: a flat world of three dimensions with a
 * few block, item and entity types, the weather and chat guards, and counts of what the host
 * read, so a test can bound the world calls a script's member makes.
 */
import type {
    BlockBreakIntent,
    BlockInteractIntent,
    EntityInteractIntent,
    ScriptAttribute,
    ScriptEquipment,
    ScriptEquipmentSlot,
    ScriptStructure,
    ScriptStructureStore,
    ChatSendIntent,
    ItemUseIntent,
    ScriptEffect,
    ScriptEffectRequest,
    ScriptSound,
    ScriptTitle,
    Guard,
    ScriptBlockPermutation,
    ScriptCommandResult,
    ScriptCommandSet,
    ScriptCommandSource,
    ScriptComponentSink,
    ScriptDamageSource,
    ScriptEntityState,
    ScriptGameEvent,
    ScriptGameEventGuard,
    ScriptGameEventVerdict,
    ScriptGameMode,
    ScriptItem,
    ScriptDisplay,
    ScriptDisplaySlot,
    ScriptItemType,
    ScriptSimulatedPlayers,
    ScriptObjective,
    ScriptParticipant,
    ScriptParticipantRef,
    ScriptProperties,
    ScriptPropertyOwner,
    ScriptPropertyValue,
    ScriptScoreboard,
    ScriptVector3,
    ScriptWeather,
    ScriptWorld,
    ScriptWorldEvent,
    VetoGuard,
    WeatherChangeIntent
} from '../host/world';

/** The block types the world knows: each state's allowed values, the first its default. */
const BLOCK_TYPES: Readonly<Record<string, Readonly<Record<string, readonly (string | number | boolean)[]>>>> = {
    'minecraft:air': {},
    'minecraft:bedrock': { infiniburn_bit: [false, true] },
    'minecraft:dirt': {},
    'minecraft:grass_block': {},
    'minecraft:stone': {},
    'minecraft:oak_log': { pillar_axis: ['y', 'x', 'z'] },
    'minecraft:chest': {}
};

/** The block types that hold a container, with its size. */
const CONTAINER_BLOCKS: Readonly<Record<string, number>> = { 'minecraft:chest': 27 };

/** The item types that wear out, with their durability. */
const DURABILITY: Readonly<Record<string, number>> = { 'minecraft:diamond_sword': 1561 };

/** The status effects the world knows. */
const EFFECT_TYPES: ReadonlySet<string> = new Set(['minecraft:speed', 'minecraft:slowness', 'minecraft:haste']);

const ITEM_TYPES: Readonly<Record<string, number>> = {
    'minecraft:apple': 64,
    'minecraft:stone': 64,
    'minecraft:diamond_sword': 1,
    'minecraft:iron_helmet': 1,
    'minecraft:leather_boots': 1
};

/** The armor pieces, with the slot each is worn in and the armor points it gives. */
const ARMOR: Readonly<Record<string, { readonly slot: ScriptEquipmentSlot; readonly points: number }>> = {
    'minecraft:iron_helmet': { slot: 'Head', points: 2 },
    'minecraft:leather_boots': { slot: 'Feet', points: 1 }
};

/** The movement speed of each entity type that has one. */
const MOVEMENT: Readonly<Record<string, number>> = { 'minecraft:pig': 0.25, 'minecraft:player': 0.1 };

/** The entity types the world can spawn, with their inventory size, health and eye height. */
const ENTITY_TYPES: Readonly<
    Record<string, { readonly inventory?: number; readonly health: number; readonly eyes: number }>
> = {
    'minecraft:armor_stand': { health: 6, eyes: 1.5 },
    'minecraft:chest_minecart': { inventory: 27, health: 0, eyes: 0.5 },
    'minecraft:pig': { health: 10, eyes: 0.75 },
    'minecraft:player': { inventory: 36, health: 20, eyes: 1.62 }
};

/** How far from the origin chunks are loaded, in blocks. */
const LOADED = 256;

interface MemoryEntity {
    id: string;
    typeId: string;
    dimension: string;
    location: ScriptVector3;
    nameTag: string;
    tags: string[];
    name?: string;
    inventory?: (ScriptItem | null)[];
    health: number;
    rotation: { x: number; y: number };
    gameMode?: ScriptGameMode;
    selectedSlot?: number;
    sneaking?: boolean;
    effects: ScriptEffect[];
    /** What a player wears and holds in the off hand; the main hand is the selected inventory slot. */
    equipment?: Partial<Record<ScriptEquipmentSlot, ScriptItem>>;
    movement?: number;
}

/** What the host read of the world, by method. */
export type WorldReads = Record<'entity' | 'entities' | 'block' | 'inventory', number>;

/** A scoreboard in memory, with fake players and entities as participants. */
export class MemoryScoreboard implements ScriptScoreboard {
    private readonly objectiveList = new Map<string, ScriptObjective>();
    /** Objective id to participant id to score. */
    private readonly scoreTable = new Map<string, Map<number, number>>();
    private readonly made: ScriptParticipant[] = [];
    private readonly slots = new Map<ScriptDisplaySlot, ScriptDisplay>();

    public constructor(private readonly world: MemoryWorld) {}

    public objectives(): readonly ScriptObjective[] {
        return [...this.objectiveList.values()];
    }
    public objective(id: string): ScriptObjective | undefined {
        return this.objectiveList.get(id);
    }
    public addObjective(id: string, displayName: string): boolean {
        if (this.objectiveList.has(id)) return false;
        this.objectiveList.set(id, { id, displayName });
        this.scoreTable.set(id, new Map());
        return true;
    }
    public removeObjective(id: string): boolean {
        if (!this.objectiveList.delete(id)) return false;
        this.scoreTable.delete(id);
        for (const [slot, display] of this.slots) if (display.objective === id) this.slots.delete(slot);
        return true;
    }
    public participants(): readonly ScriptParticipant[] {
        return this.made.filter(({ id }) => [...this.scoreTable.values()].some((scores) => scores.has(id)));
    }
    public participant(ref: ScriptParticipantRef): ScriptParticipant | undefined {
        return this.participants().find((each) => this.matches(each, ref));
    }
    public scores(objective: string): readonly { readonly participant: ScriptParticipant; readonly score: number }[] {
        const scores = this.scoreTable.get(objective);
        return this.made.flatMap((participant) => {
            const score = scores?.get(participant.id);
            return score === undefined ? [] : [{ participant, score }];
        });
    }
    public score(objective: string, participant: number): number | undefined {
        return this.scoreTable.get(objective)?.get(participant);
    }
    public setScore(objective: string, ref: ScriptParticipantRef, score: number): ScriptParticipant {
        let participant = this.made.find((each) => this.matches(each, ref));
        if (participant === undefined) {
            const entity = 'entity' in ref ? this.world.entity(ref.entity) : undefined;
            participant =
                entity === undefined
                    ? { id: this.made.length + 1, type: 'FakePlayer', displayName: 'name' in ref ? ref.name : '' }
                    : {
                          id: this.made.length + 1,
                          type: entity.typeId === 'minecraft:player' ? 'Player' : 'Entity',
                          displayName: entity.name ?? entity.id,
                          entity: entity.id
                      };
            this.made.push(participant);
        }
        this.scoreTable.get(objective)?.set(participant.id, score);
        return participant;
    }
    public removeScore(objective: string, participant: number): boolean {
        return this.scoreTable.get(objective)?.delete(participant) ?? false;
    }
    public display(slot: ScriptDisplaySlot): ScriptDisplay | undefined {
        return this.slots.get(slot);
    }
    public setDisplay(slot: ScriptDisplaySlot, display: ScriptDisplay | undefined): void {
        if (display === undefined) this.slots.delete(slot);
        else this.slots.set(slot, display);
    }

    private matches(participant: ScriptParticipant, ref: ScriptParticipantRef): boolean {
        if ('participant' in ref) return participant.id === ref.participant;
        if ('entity' in ref) return participant.entity === ref.entity;
        return participant.type === 'FakePlayer' && participant.displayName === ref.name;
    }
}

/** A flat world in memory. */
export class MemoryWorld implements ScriptWorld {
    /** The dynamic properties, by owner and pack. */
    public readonly properties = new Map<string, Map<string, ScriptPropertyValue>>();
    public readonly scoreboard: MemoryScoreboard = new MemoryScoreboard(this);
    public now = 1_800_000_000_000;
    /** The lines `sendMessage` put on screens, with the player's id after a `>` when it went to one. */
    public readonly messages: string[] = [];
    /** The chat lines the guards let through. */
    public readonly chats: string[] = [];
    /** The commands scripts ran, with their source. */
    public readonly commands: string[] = [];
    public readonly reads: WorldReads = { entity: 0, entities: 0, block: 0, inventory: 0 };
    /** The custom commands the scripts put into the command tree, until they take them out. */
    public commandSet: ScriptCommandSet | undefined;
    /** How many times the scripts registered custom commands. */
    public commandRegistrations = 0;
    /** Where the scripts take the custom component hooks, once they have registered components. */
    public componentSink: ScriptComponentSink | undefined;
    private current: ScriptWeather = 'Clear';
    private readonly guards: Guard<WeatherChangeIntent>[] = [];
    private readonly chatGuards: VetoGuard<ChatSendIntent>[] = [];
    private readonly leaveWatchers: ((player: string) => void)[] = [];
    private readonly committed: ScriptWorldEvent[] = [];
    private readonly live = new Map<string, MemoryEntity>();
    private readonly set = new Map<string, ScriptBlockPermutation>();
    private nextId = 1;
    private readonly containers = new Map<string, (ScriptItem | null)[]>();
    private readonly breakGuards: VetoGuard<BlockBreakIntent>[] = [];
    private readonly useGuards: VetoGuard<ItemUseIntent>[] = [];
    /** The titles players were shown, as `<player> <kind> <text or times>`. */
    public readonly titles: string[] = [];
    /** The sounds played. */
    public readonly sounds: ScriptSound[] = [];
    /** The particles spawned, as `<effect> <MoLang JSON>`, and `> <player>` for one player's. */
    public readonly particles: string[] = [];
    private readonly blockInteractGuards: VetoGuard<BlockInteractIntent>[] = [];
    private readonly entityInteractGuards: VetoGuard<EntityInteractIntent>[] = [];
    private readonly kept = new Map<string, ScriptStructure>();
    /** The world's structures, in memory. */
    public readonly structures: ScriptStructureStore = {
        get: (id) => this.kept.get(id),
        set: (id, structure) => void this.kept.set(id, structure),
        delete: (id) => this.kept.delete(id),
        ids: () => [...this.kept.keys()]
    };

    /** A player clicks a block, past the interact guards. @returns Whether the click went on. */
    public interactWithBlock(intent: BlockInteractIntent & { readonly itemAfter?: ScriptItem }): boolean {
        for (const guard of this.blockInteractGuards) if (guard(intent).veto) return false;
        this.committed.push({ type: 'playerInteractWithBlock', ...intent });
        return true;
    }

    /** A player clicks an entity, past the interact guards. @returns Whether the click went on. */
    public interactWithEntity(intent: EntityInteractIntent & { readonly itemAfter?: ScriptItem }): boolean {
        for (const guard of this.entityInteractGuards) if (guard(intent).veto) return false;
        this.committed.push({ type: 'playerInteractWithEntity', ...intent });
        return true;
    }
    public guardBlockInteract(guard: VetoGuard<BlockInteractIntent>): () => void {
        this.blockInteractGuards.push(guard);
        return () => this.blockInteractGuards.splice(this.blockInteractGuards.indexOf(guard), 1);
    }
    public guardEntityInteract(guard: VetoGuard<EntityInteractIntent>): () => void {
        this.entityInteractGuards.push(guard);
        return () => this.entityInteractGuards.splice(this.entityInteractGuards.indexOf(guard), 1);
    }
    public equipment(id: string): ScriptEquipment | undefined {
        const found = this.live.get(id);
        if (found?.equipment === undefined) return undefined;
        const hand = found.inventory?.[found.selectedSlot ?? 0] ?? null;
        const slots = { ...found.equipment, ...(hand === null ? {} : { Mainhand: { ...hand } }) };
        const armor = Object.values(slots).reduce((sum, item) => sum + (ARMOR[item.typeId]?.points ?? 0), 0);
        return { slots, armor, toughness: 0 };
    }
    /** Wears a piece only in its slot, holds anything in a hand, and has no body slot, as a player. */
    public setEquipment(id: string, slot: ScriptEquipmentSlot, item: ScriptItem | undefined): boolean {
        const found = this.live.get(id);
        if (found?.equipment === undefined || slot === 'Body') return false;
        if (slot === 'Mainhand') {
            this.setInventoryItem(id, found.selectedSlot ?? 0, item);
            return true;
        }
        if (item !== undefined && slot !== 'Offhand' && ARMOR[item.typeId]?.slot !== slot) return false;
        if (item === undefined) delete found.equipment[slot];
        else found.equipment[slot] = { ...item };
        return true;
    }
    public attribute(id: string, name: string): ScriptAttribute | undefined {
        const found = this.live.get(id);
        if (found === undefined) return undefined;
        const most = ENTITY_TYPES[found.typeId]?.health ?? 0;
        if (name === 'minecraft:health' && most > 0) return { current: found.health, default: most, min: 0, max: most };
        const speed = MOVEMENT[found.typeId];
        if (name !== 'minecraft:movement' || speed === undefined) return undefined;
        return { current: found.movement ?? speed, default: speed, min: 0, max: Number.MAX_VALUE };
    }
    public setAttribute(id: string, name: string, value: number): void {
        const found = this.live.get(id);
        if (found === undefined) return;
        if (name === 'minecraft:health') found.health = value;
        else if (name === 'minecraft:movement') found.movement = value;
    }
    public effectTypes(): readonly string[] {
        return [...EFFECT_TYPES];
    }

    /** A player breaks a block, past the break guards, as a client's break does. @returns Whether it broke. */
    public breakBlock(player: string, dimension: string, location: ScriptVector3): boolean {
        const permutation = this.block(dimension, location);
        if (permutation === undefined || permutation.typeId === 'minecraft:air') return false;
        const block = { dimension, ...location };
        for (const guard of this.breakGuards) if (guard({ player, block }).veto) return false;
        const air = this.resolveBlock('minecraft:air', {});
        if (air !== undefined) this.setBlock(dimension, location, air);
        this.committed.push({ type: 'playerBreakBlock', player, block, brokenBlockPermutation: permutation });
        return true;
    }

    /** A player uses an item, past the item use guards. @returns Whether it was used. */
    public useItem(player: string, item: ScriptItem): boolean {
        for (const guard of this.useGuards) if (guard({ player, item }).veto) return false;
        this.committed.push({ type: 'itemUse', player, item });
        return true;
    }
    public guardBlockBreak(guard: VetoGuard<BlockBreakIntent>): () => void {
        this.breakGuards.push(guard);
        return () => this.breakGuards.splice(this.breakGuards.indexOf(guard), 1);
    }
    public guardItemUse(guard: VetoGuard<ItemUseIntent>): () => void {
        this.useGuards.push(guard);
        return () => this.useGuards.splice(this.useGuards.indexOf(guard), 1);
    }
    public setSneaking(id: string, sneaking: boolean): void {
        const entity = this.live.get(id);
        if (entity !== undefined) entity.sneaking = sneaking;
    }
    public showTitle(player: string, title: ScriptTitle): void {
        this.titles.push(
            `${player} ${title.kind}${'text' in title ? ` ${title.text}` : ''}${
                title.kind === 'times' ? ` ${title.fadeIn} ${title.stay} ${title.fadeOut}` : ''
            }`
        );
    }
    public playSound(sound: ScriptSound): void {
        this.sounds.push(sound);
    }
    public spawnParticle(
        _dimension: string,
        effect: string,
        _location: ScriptVector3,
        molang?: string,
        player?: string
    ): void {
        this.particles.push(`${effect} ${molang ?? ''}${player === undefined ? '' : ` > ${player}`}`);
    }
    public isEffectType(typeId: string): boolean {
        return EFFECT_TYPES.has(typeId);
    }
    public effects(id: string): readonly ScriptEffect[] | undefined {
        return this.live.get(id)?.effects.map((effect) => ({ ...effect }));
    }
    /** Adds an effect by `/effect`'s rule: a weaker or shorter one of the same strength changes nothing. */
    public addEffect(id: string, { typeId, amplifier, duration }: ScriptEffectRequest): void {
        const effects = this.live.get(id)?.effects;
        if (effects === undefined) return;
        const at = effects.findIndex((each) => each.typeId === typeId);
        const held = effects[at];
        if (
            held !== undefined &&
            (amplifier < held.amplifier || (amplifier === held.amplifier && duration <= held.duration))
        )
            return;
        if (at >= 0) effects[at] = { typeId, amplifier, duration };
        else effects.push({ typeId, amplifier, duration });
    }
    public removeEffect(id: string, typeId: string): boolean {
        const effects = this.live.get(id)?.effects;
        const at = effects?.findIndex((each) => each.typeId === typeId) ?? -1;
        if (effects === undefined || at < 0) return false;
        effects.splice(at, 1);
        return true;
    }
    public blockInventory(dimension: string, location: ScriptVector3): readonly (ScriptItem | null)[] | undefined {
        const size = CONTAINER_BLOCKS[this.block(dimension, location)?.typeId ?? ''];
        if (size === undefined) return undefined;
        const key = this.blockKey(dimension, location);
        const slots = this.containers.get(key) ?? new Array<ScriptItem | null>(size).fill(null);
        this.containers.set(key, slots);
        return slots.map((slot) => (slot === null ? null : { ...slot }));
    }
    public setBlockInventoryItem(
        dimension: string,
        location: ScriptVector3,
        slot: number,
        item: ScriptItem | undefined
    ): void {
        if (this.blockInventory(dimension, location) === undefined) return;
        const slots = this.containers.get(this.blockKey(dimension, location));
        if (slots !== undefined && slot >= 0 && slot < slots.length) slots[slot] = item ?? null;
    }

    /** The ids of the players online, in the order they joined. */
    public get online(): readonly string[] {
        return [...this.live.values()].filter((each) => each.typeId === 'minecraft:player').map((each) => each.id);
    }

    /** A player joins, spawns at the origin and is announced to the scripts' after-events. */
    public join(name: string): string {
        const id = this.add('minecraft:overworld', 'minecraft:player', { x: 0.5, y: -60, z: 0.5 });
        const player = this.live.get(id);
        if (player !== undefined) {
            player.name = name;
            player.nameTag = name;
        }
        this.committed.push({ type: 'playerJoin', playerId: id, playerName: name });
        this.committed.push({ type: 'playerSpawn', playerId: id, initialSpawn: true });
        return id;
    }

    /** A player leaves: the before-event watchers run, then their entity goes. */
    public leave(id: string): void {
        const player = this.live.get(id);
        if (player === undefined) return;
        for (const watcher of this.leaveWatchers) watcher(id);
        this.live.delete(id);
        this.committed.push({ type: 'playerLeave', playerId: id, playerName: player.name ?? '' });
    }

    /** A player types a line of chat. */
    public chat(sender: string, message: string): void {
        for (const guard of this.chatGuards) if (guard({ sender, message }).veto) return;
        this.chats.push(`${sender}: ${message}`);
        this.committed.push({ type: 'chatSend', sender, message });
    }

    /** What the simulated players were told to do, as `<id> <action kind>`, and the ticks they moved. */
    public readonly acted: string[] = [];
    public simulatedTicks = 0;
    /** The GameTest structures placed, as `<dimension> <x> <y> <z> <bytes>`. */
    public readonly placedStructures: string[] = [];

    /** The world's simulated players: players who join and leave as any other, with no client. */
    public readonly simulatedPlayers: ScriptSimulatedPlayers = {
        spawn: (name, dimension, location) => {
            const id = this.join(name);
            const player = this.live.get(id);
            if (player !== undefined) {
                player.dimension = dimension;
                player.location = { ...location };
            }
            return id;
        },
        remove: (id) => this.leave(id),
        act: (id, action) => {
            this.acted.push(`${id} ${action.kind}`);
            if (action.kind === 'chat') this.chat(id, action.message);
            if (action.kind === 'useItem') return this.useItem(id, action.item);
            if (action.kind === 'breakBlock') {
                const dimension = this.live.get(id)?.dimension ?? 'minecraft:overworld';
                return this.breakBlock(id, dimension, action.location);
            }
            return action.kind === 'jump';
        },
        tick: () => {
            this.simulatedTicks++;
        }
    };

    public placeStructure(dimension: string, { x, y, z }: ScriptVector3, structure: Uint8Array): void {
        this.placedStructures.push(`${dimension} ${x} ${y} ${z} ${structure.length}`);
    }

    /** How many guards the runtime still has on the world's actions. */
    public guardCount(): number {
        return this.guards.length + this.chatGuards.length + this.breakGuards.length + this.useGuards.length;
    }

    public dynamicProperties(owner: ScriptPropertyOwner, pack: string): ScriptProperties | undefined {
        if (owner !== 'world' && !this.live.has(owner.entity)) return undefined;
        return this.properties.get(this.propertyKey(owner, pack)) ?? new Map();
    }
    public setDynamicProperties(
        owner: ScriptPropertyOwner,
        pack: string,
        values: ReadonlyMap<string, ScriptPropertyValue | undefined>
    ): void {
        const key = this.propertyKey(owner, pack);
        const properties = this.properties.get(key) ?? new Map<string, ScriptPropertyValue>();
        for (const [id, value] of values) {
            if (value === undefined) properties.delete(id);
            else properties.set(id, value);
        }
        this.properties.set(key, properties);
    }
    public clearDynamicProperties(owner: ScriptPropertyOwner, pack: string): void {
        this.properties.delete(this.propertyKey(owner, pack));
    }
    private propertyKey(owner: ScriptPropertyOwner, pack: string): string {
        return `${owner === 'world' ? 'world' : owner.entity}\n${pack}`;
    }

    public dimensions(): readonly string[] {
        return ['minecraft:overworld', 'minecraft:nether', 'minecraft:the_end'];
    }
    public players(): readonly string[] {
        return this.online;
    }
    public sendMessage(message: string, player?: string): void {
        this.messages.push(player === undefined ? message : `${player}> ${message}`);
    }
    public entity(id: string): ScriptEntityState | undefined {
        this.reads.entity++;
        const found = this.live.get(id);
        return found === undefined ? undefined : this.stateOf(found);
    }
    public entities(dimension: string): readonly ScriptEntityState[] {
        this.reads.entities++;
        return [...this.live.values()].filter((each) => each.dimension === dimension).map((each) => this.stateOf(each));
    }
    public spawnEntity(
        dimension: string,
        typeId: string,
        location: ScriptVector3
    ): string | 'unknown-type' | 'unloaded' {
        if (!(typeId in ENTITY_TYPES)) return 'unknown-type';
        if (!this.loaded(location)) return 'unloaded';
        const id = this.add(dimension, typeId, location);
        this.committed.push({ type: 'entitySpawn', entity: { id, typeId }, cause: 'Spawned' });
        return id;
    }
    public teleport(id: string, dimension: string, location: ScriptVector3): void {
        const found = this.live.get(id);
        if (found === undefined) return;
        found.dimension = dimension;
        found.location = { ...location };
    }
    public kill(id: string): boolean {
        return this.live.delete(id);
    }
    /** Takes the blow off the entity's health, and kills it at zero. No blow is ever turned aside. */
    public applyDamage(id: string, amount: number, source: ScriptDamageSource): boolean {
        const found = this.live.get(id);
        if (found === undefined || amount <= 0 || found.health <= 0) return false;
        const damage = Math.min(amount, found.health);
        found.health -= damage;
        const entity = { id, typeId: found.typeId };
        this.committed.push({ type: 'entityHurt', entity, damage: amount, source });
        if (found.health <= 0) {
            this.live.delete(id);
            this.committed.push({ type: 'entityDie', entity, source });
        }
        return true;
    }
    public setGameMode(id: string, gameMode: ScriptGameMode): void {
        const found = this.live.get(id);
        if (found?.gameMode !== undefined) found.gameMode = gameMode;
    }
    public setSelectedSlot(id: string, slot: number): void {
        const found = this.live.get(id);
        if (found?.selectedSlot !== undefined) found.selectedSlot = slot;
    }
    /** Turns an entity to face a direction, in degrees. */
    public rotate(id: string, rotation: { x: number; y: number }): void {
        const found = this.live.get(id);
        if (found !== undefined) found.rotation = { ...rotation };
    }
    public remove(id: string): void {
        this.live.delete(id);
    }
    public setNameTag(id: string, nameTag: string): void {
        const found = this.live.get(id);
        if (found !== undefined) found.nameTag = nameTag;
    }
    public addTag(id: string, tag: string): boolean {
        const found = this.live.get(id);
        if (found === undefined || found.tags.includes(tag)) return false;
        found.tags.push(tag);
        return true;
    }
    public removeTag(id: string, tag: string): boolean {
        const found = this.live.get(id);
        const index = found?.tags.indexOf(tag) ?? -1;
        if (found === undefined || index < 0) return false;
        found.tags.splice(index, 1);
        return true;
    }
    public inventory(id: string): readonly (ScriptItem | null)[] | undefined {
        this.reads.inventory++;
        return this.live.get(id)?.inventory?.map((slot) => (slot === null ? null : { ...slot }));
    }
    public setInventoryItem(id: string, slot: number, item: ScriptItem | undefined): void {
        const inventory = this.live.get(id)?.inventory;
        if (inventory !== undefined && slot >= 0 && slot < inventory.length) inventory[slot] = item ?? null;
    }
    public heightRange(): { readonly min: number; readonly max: number } {
        return { min: -64, max: 320 };
    }
    public block(dimension: string, location: ScriptVector3): ScriptBlockPermutation | undefined {
        this.reads.block++;
        if (!this.loaded(location)) return undefined;
        const placed = this.set.get(this.blockKey(dimension, location));
        if (placed !== undefined) return placed;
        const typeId =
            location.y === -64
                ? 'minecraft:bedrock'
                : location.y === -61
                  ? 'minecraft:grass_block'
                  : location.y < -61 && location.y > -64
                    ? 'minecraft:dirt'
                    : 'minecraft:air';
        return this.resolveBlock(typeId, {});
    }
    public setBlock(dimension: string, location: ScriptVector3, permutation: ScriptBlockPermutation): void {
        this.set.set(this.blockKey(dimension, location), permutation);
        if (CONTAINER_BLOCKS[permutation.typeId] === undefined)
            this.containers.delete(this.blockKey(dimension, location));
    }
    public resolveBlock(
        typeId: string,
        states: Readonly<Record<string, string | number | boolean>>
    ): ScriptBlockPermutation | undefined {
        const type = BLOCK_TYPES[typeId];
        if (type === undefined) return undefined;
        if (Object.keys(states).some((name) => !(name in type))) return undefined;
        const resolved: Record<string, string | number | boolean> = {};
        for (const [name, values] of Object.entries(type)) {
            const given = states[name];
            const first = values[0];
            if (first === undefined) continue;
            resolved[name] = given !== undefined && values.includes(given) ? given : first;
        }
        return { typeId, states: resolved };
    }
    public itemType(typeId: string): ScriptItemType | undefined {
        const maxStackSize = ITEM_TYPES[typeId];
        const maxDurability = DURABILITY[typeId];
        return maxStackSize === undefined
            ? undefined
            : { typeId, maxStackSize, ...(maxDurability === undefined ? {} : { maxDurability }) };
    }
    public runCommand(command: string, source: ScriptCommandSource): ScriptCommandResult {
        this.commands.push(`${'entity' in source ? source.entity : source.dimension}: ${command}`);
        const [name, id, ...message] = command.split(' ');
        if (name === 'say') return { successCount: 1 };
        if (name === 'scriptevent' && id !== undefined && id.includes(':')) {
            this.committed.push({
                type: 'scriptEvent',
                id,
                message: message.join(' '),
                sourceType: 'entity' in source ? 'Entity' : 'Server',
                ...('entity' in source ? { sourceEntity: source.entity } : {})
            });
            return { successCount: 1 };
        }
        return { error: `Syntax error: Unexpected "${name}": at ">>${command}<<"` };
    }
    public watchPlayerLeave(listener: (player: string) => void): () => void {
        this.leaveWatchers.push(listener);
        return () => this.leaveWatchers.splice(this.leaveWatchers.indexOf(listener), 1);
    }
    public guardChat(guard: VetoGuard<ChatSendIntent>): () => void {
        this.chatGuards.push(guard);
        return () => this.chatGuards.splice(this.chatGuards.indexOf(guard), 1);
    }
    public weather(): ScriptWeather {
        return this.current;
    }
    /** Changes the weather as `WorldWeather.set` does: weather it already has runs no guard and commits nothing. */
    public setWeather(dimension: string, weather: ScriptWeather, duration: number): void {
        if (weather === this.current) return;
        let intent: WeatherChangeIntent = { dimension, previousWeather: this.current, newWeather: weather, duration };
        for (const guard of this.guards) {
            const verdict = guard(intent);
            if (verdict.veto) return;
            intent = verdict.intent;
        }
        this.committed.push({
            type: 'weatherChange',
            dimension,
            previousWeather: this.current,
            newWeather: intent.newWeather
        });
        this.current = intent.newWeather;
    }
    public guardWeather(guard: Guard<WeatherChangeIntent>): () => void {
        this.guards.push(guard);
        return () => this.guards.splice(this.guards.indexOf(guard), 1);
    }
    public takeEvents(): readonly ScriptWorldEvent[] {
        return this.committed.splice(0);
    }

    private readonly gameGuards: ScriptGameEventGuard[] = [];

    /**
     * Raises a world event of `events/worldEvents.ts`: a before-event goes past the guards and
     * returns their verdict, an after-event waits for the flush.
     */
    public raise(event: ScriptGameEvent): ScriptGameEventVerdict {
        let fields = event.fields;
        if (!event.event.endsWith('BeforeEvent')) {
            this.committed.push({ type: 'game', ...event });
            return { veto: false, fields };
        }
        for (const guard of this.gameGuards) {
            const verdict = guard({ event: event.event, fields });
            if (verdict.veto) return verdict;
            fields = verdict.fields;
        }
        return { veto: false, fields };
    }
    public guardGameEvents(guard: ScriptGameEventGuard): () => void {
        this.gameGuards.push(guard);
        return () => this.gameGuards.splice(this.gameGuards.indexOf(guard), 1);
    }
    public registerCommands(commands: ScriptCommandSet): () => void {
        this.commandSet = commands;
        this.commandRegistrations++;
        return () => {
            if (this.commandSet === commands) this.commandSet = undefined;
        };
    }
    public bindComponents(sink: ScriptComponentSink): () => void {
        this.componentSink = sink;
        return () => {
            if (this.componentSink === sink) this.componentSink = undefined;
        };
    }
    public clock(): number {
        return this.now;
    }

    private add(dimension: string, typeId: string, location: ScriptVector3): string {
        const id = String(this.nextId++);
        const type = ENTITY_TYPES[typeId];
        const size = type?.inventory;
        this.live.set(id, {
            id,
            typeId,
            dimension,
            location: { ...location },
            nameTag: '',
            tags: [],
            health: type?.health ?? 1,
            rotation: { x: 0, y: 0 },
            effects: [],
            ...(size === undefined ? {} : { inventory: new Array<ScriptItem | null>(size).fill(null) }),
            ...(typeId === 'minecraft:player' ? { gameMode: 'Survival', selectedSlot: 0, equipment: {} } : {})
        });
        return id;
    }
    private stateOf(entity: MemoryEntity): ScriptEntityState {
        return {
            id: entity.id,
            typeId: entity.typeId,
            dimension: entity.dimension,
            location: { ...entity.location },
            nameTag: entity.nameTag,
            tags: [...entity.tags],
            ...(entity.name === undefined ? {} : { name: entity.name }),
            ...(entity.inventory === undefined ? {} : { inventorySize: entity.inventory.length }),
            rotation: { ...entity.rotation },
            headLocation: { ...entity.location, y: entity.location.y + (ENTITY_TYPES[entity.typeId]?.eyes ?? 0) },
            sneaking: entity.sneaking === true,
            ...(entity.gameMode === undefined ? {} : { gameMode: entity.gameMode }),
            ...(entity.selectedSlot === undefined ? {} : { selectedSlot: entity.selectedSlot })
        };
    }
    private loaded(location: ScriptVector3): boolean {
        return Math.abs(location.x) < LOADED && Math.abs(location.z) < LOADED;
    }
    private blockKey(dimension: string, { x, y, z }: ScriptVector3): string {
        return `${dimension} ${x} ${y} ${z}`;
    }
}
