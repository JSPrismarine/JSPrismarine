/**
 * A {@link ScriptWorld} in memory for the host's tests: a flat world of three dimensions with a
 * few block, item and entity types, the weather and chat guards, and counts of what the host
 * read, so a test can bound the world calls a script's member makes.
 */
import type {
    ChatSendIntent,
    Guard,
    ScriptBlockPermutation,
    ScriptCommandResult,
    ScriptCommandSource,
    ScriptEntityState,
    ScriptItem,
    ScriptItemType,
    ScriptSimulatedPlayers,
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
    'minecraft:oak_log': { pillar_axis: ['y', 'x', 'z'] }
};

const ITEM_TYPES: Readonly<Record<string, number>> = { 'minecraft:apple': 64, 'minecraft:stone': 64 };

/** The entity types the world can spawn, with their inventory size. */
const ENTITY_TYPES: Readonly<Record<string, number | undefined>> = {
    'minecraft:armor_stand': undefined,
    'minecraft:chest_minecart': 27,
    'minecraft:player': 36
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
}

/** What the host read of the world, by method. */
export type WorldReads = Record<'entity' | 'entities' | 'block' | 'inventory', number>;

/** A flat world in memory. */
export class MemoryWorld implements ScriptWorld {
    public now = 1_800_000_000_000;
    /** The lines `sendMessage` put on screens, with the player's id after a `>` when it went to one. */
    public readonly messages: string[] = [];
    /** The chat lines the guards let through. */
    public readonly chats: string[] = [];
    /** The commands scripts ran, with their source. */
    public readonly commands: string[] = [];
    public readonly reads: WorldReads = { entity: 0, entities: 0, block: 0, inventory: 0 };
    private current: ScriptWeather = 'Clear';
    private readonly guards: Guard<WeatherChangeIntent>[] = [];
    private readonly chatGuards: VetoGuard<ChatSendIntent>[] = [];
    private readonly leaveWatchers: ((player: string) => void)[] = [];
    private readonly committed: ScriptWorldEvent[] = [];
    private readonly live = new Map<string, MemoryEntity>();
    private readonly set = new Map<string, ScriptBlockPermutation>();
    private nextId = 1;

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
    /** The structures placed, as `<dimension> <x> <y> <z> <bytes>`. */
    public readonly structures: string[] = [];

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
            return action.kind === 'jump';
        },
        tick: () => {
            this.simulatedTicks++;
        }
    };

    public placeStructure(dimension: string, { x, y, z }: ScriptVector3, structure: Uint8Array): void {
        this.structures.push(`${dimension} ${x} ${y} ${z} ${structure.length}`);
    }

    /** How many guards the runtime still has on the world's actions. */
    public guardCount(): number {
        return this.guards.length + this.chatGuards.length;
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
        return this.add(dimension, typeId, location);
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
        return maxStackSize === undefined ? undefined : { typeId, maxStackSize };
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
    public clock(): number {
        return this.now;
    }

    private add(dimension: string, typeId: string, location: ScriptVector3): string {
        const id = String(this.nextId++);
        const size = ENTITY_TYPES[typeId];
        this.live.set(id, {
            id,
            typeId,
            dimension,
            location: { ...location },
            nameTag: '',
            tags: [],
            ...(size === undefined ? {} : { inventory: new Array<ScriptItem | null>(size).fill(null) })
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
            ...(entity.inventory === undefined ? {} : { inventorySize: entity.inventory.length })
        };
    }
    private loaded(location: ScriptVector3): boolean {
        return Math.abs(location.x) < LOADED && Math.abs(location.z) < LOADED;
    }
    private blockKey(dimension: string, { x, y, z }: ScriptVector3): string {
        return `${dimension} ${x} ${y} ${z}`;
    }
}
