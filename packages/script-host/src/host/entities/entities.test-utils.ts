/**
 * A {@link MemoryWorld} with entity systems, for the tests of the entity and player members: a
 * pig's and a player's components as their definitions write them, each entity's motion, fire,
 * riders, leash and owner, a player's experience and spawn point, and every message a player's
 * client was sent.
 */
import { MemoryWorld } from '../../testing/memoryWorld.test-utils';
import type { ScriptItem } from '../world';
import type {
    ScriptAimAssistRegistry,
    ScriptClientInfo,
    ScriptClientMessage,
    ScriptDimensionLocation,
    ScriptEntityProperty,
    ScriptEntityStatus,
    ScriptEntitySystems,
    ScriptExperience,
    ScriptRotation
} from './world';

/** The components each entity type's definition gives it. */
const DEFINITIONS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
    'minecraft:pig': {
        'minecraft:leashable': {},
        'minecraft:rideable': { seat_count: 1, family_types: ['baby_undead'], seats: { position: [0, 0.7, 0] } },
        'minecraft:navigation.walk': { avoid_water: true },
        'minecraft:behavior.float': { priority: 0 },
        'minecraft:healable': { items: [{ item: 'carrot', heal_amount: 2 }] },
        'minecraft:tameable': { probability: 0.5, tame_items: ['fish'] },
        'minecraft:type_family': { family: ['pig', 'mob'] },
        'minecraft:breathable': { total_supply: 15, suffocate_time: 0 }
    },
    'minecraft:player': { 'minecraft:type_family': { family: ['player'] } }
};

/** The `format_version` of each type's file. */
const FORMAT_VERSIONS: Readonly<Record<string, string>> = { 'minecraft:pig': '1.26.50', 'minecraft:player': '1.26.60' };

/** The events each type's definition declares. */
const EVENTS: Readonly<Record<string, readonly string[]>> = { 'minecraft:pig': ['minecraft:entity_born'] };

/** Each entity's own state in the systems. */
interface EntityRecord {
    velocity: { x: number; y: number; z: number };
    rotation?: ScriptRotation;
    fireTicks: number;
    vehicle?: string;
    leashHolder?: string;
    owner?: string;
    tamed: boolean;
    readonly fields: Map<string, Record<string, unknown>>;
    readonly properties: Map<string, number | boolean | string>;
    experience: ScriptExperience;
    spawnPoint?: ScriptDimensionLocation;
    commandLevel?: number;
    readonly enderChest: (ScriptItem | null)[];
}

/** The entity systems of a {@link MemoryWorld}. */
export class MemoryEntitySystems implements ScriptEntitySystems {
    /** Every message sent to a player's client, with the player. */
    public readonly sent: { readonly player: string; readonly message: ScriptClientMessage }[] = [];
    /** Every event a script triggered, with its entity. */
    public readonly triggered: { readonly id: string; readonly event: string }[] = [];
    /** The aim assist entries scripts added. */
    public readonly added: ScriptAimAssistRegistry[] = [];
    private readonly records = new Map<string, EntityRecord>();

    public constructor(private readonly world: MemoryWorld) {}

    private record(id: string): EntityRecord | undefined {
        if (this.world.entity(id) === undefined) return undefined;
        const found = this.records.get(id) ?? {
            velocity: { x: 0, y: 0, z: 0 },
            fireTicks: 0,
            tamed: false,
            fields: new Map(),
            properties: new Map(),
            experience: { level: 0, progress: 0 },
            enderChest: Array.from({ length: 27 }, () => null)
        };
        this.records.set(id, found);
        return found;
    }

    public components(id: string): ReadonlyMap<string, unknown> | undefined {
        const entity = this.world.entity(id);
        const record = this.record(id);
        if (entity === undefined || record === undefined) return undefined;
        const found = new Map<string, unknown>(Object.entries(DEFINITIONS[entity.typeId] ?? {}));
        for (const [component, set] of record.fields) found.set(component, { ...(found.get(component) ?? {}), ...set });
        if (record.fireTicks > 0) found.set('minecraft:onfire', {});
        if (record.vehicle !== undefined) found.set('minecraft:riding', {});
        if (entity.typeId === 'minecraft:player') {
            found.set('minecraft:cursor_inventory', record.fields.get('minecraft:cursor_inventory') ?? {});
            found.set('minecraft:ender_inventory', {});
        }
        return found;
    }

    public formatVersion(id: string): string | undefined {
        const entity = this.world.entity(id);
        return entity === undefined ? undefined : FORMAT_VERSIONS[entity.typeId];
    }

    public status(id: string): ScriptEntityStatus | undefined {
        const entity = this.world.entity(id);
        const record = this.record(id);
        if (entity === undefined || record === undefined) return undefined;
        const { x, y, z } = entity.location;
        return {
            velocity: { ...record.velocity },
            onGround: true,
            inWater: false,
            climbing: false,
            sleeping: false,
            sprinting: false,
            swimming: false,
            fireTicks: record.fireTicks,
            box: { min: { x: x - 0.45, y, z: z - 0.45 }, max: { x: x + 0.45, y: y + 0.9, z: z + 0.45 } },
            riders: [...this.records].flatMap(([rider, each]) => (each.vehicle === id ? [rider] : [])),
            ...(record.vehicle === undefined ? {} : { vehicle: record.vehicle }),
            ...(record.leashHolder === undefined ? {} : { leashHolder: record.leashHolder }),
            ...(record.owner === undefined ? {} : { owner: record.owner }),
            tamed: record.tamed
        };
    }

    public triggerEvent(id: string, event: string): boolean {
        const entity = this.world.entity(id);
        if (entity === undefined || !(EVENTS[entity.typeId] ?? []).includes(event)) return false;
        this.triggered.push({ id, event });
        return true;
    }

    public properties(id: string): ReadonlyMap<string, ScriptEntityProperty> | undefined {
        const entity = this.world.entity(id);
        const record = this.record(id);
        if (entity === undefined || record === undefined) return undefined;
        if (entity.typeId !== 'minecraft:pig') return new Map();
        return new Map<string, ScriptEntityProperty>([
            [
                'minecraft:climate_variant',
                {
                    type: 'enum',
                    value: record.properties.get('minecraft:climate_variant') ?? 'temperate',
                    defaultValue: 'temperate',
                    values: ['temperate', 'warm', 'cold']
                }
            ],
            ['jsp:size', { type: 'int', value: record.properties.get('jsp:size') ?? 1, defaultValue: 1, range: [1, 5] }]
        ]);
    }

    public setProperty(id: string, name: string, value: number | boolean | string): void {
        this.record(id)?.properties.set(name, value);
    }

    public applyImpulse(id: string, impulse: { x: number; y: number; z: number }): void {
        const record = this.record(id);
        if (record === undefined) return;
        record.velocity = {
            x: record.velocity.x + impulse.x,
            y: record.velocity.y + impulse.y,
            z: record.velocity.z + impulse.z
        };
    }

    public clearVelocity(id: string): void {
        const record = this.record(id);
        if (record !== undefined) record.velocity = { x: 0, y: 0, z: 0 };
    }

    public applyKnockback(id: string, horizontal: { readonly x: number; readonly z: number }, vertical: number): void {
        const record = this.record(id);
        if (record !== undefined) record.velocity = { x: horizontal.x, y: vertical, z: horizontal.z };
    }

    public setRotation(id: string, rotation: ScriptRotation): void {
        this.world.rotate(id, rotation);
    }

    public setOnFire(id: string, ticks: number): boolean {
        const record = this.record(id);
        if (record === undefined) return false;
        record.fireTicks = Math.max(record.fireTicks, ticks);
        return true;
    }

    public extinguishFire(id: string): boolean {
        const record = this.record(id);
        if (record === undefined || record.fireTicks <= 0) return false;
        record.fireTicks = 0;
        return true;
    }

    public ride(rider: string, vehicle: string): boolean {
        const record = this.record(rider);
        if (record === undefined || this.record(vehicle) === undefined) return false;
        record.vehicle = vehicle;
        return true;
    }

    public dismount(rider: string): void {
        const record = this.record(rider);
        if (record !== undefined) delete record.vehicle;
    }

    public leash(id: string, holder: string | undefined): void {
        const record = this.record(id);
        if (record === undefined) return;
        if (holder === undefined) delete record.leashHolder;
        else record.leashHolder = holder;
    }

    public tame(id: string, player: string | undefined): boolean {
        const record = this.record(id);
        if (record === undefined || record.tamed) return false;
        record.tamed = true;
        if (player !== undefined) record.owner = player;
        return true;
    }

    public setComponentField(id: string, component: string, field: string, value: unknown): void {
        const record = this.record(id);
        if (record === undefined) return;
        record.fields.set(component, { ...(record.fields.get(component) ?? {}), [field]: value });
    }

    public itemIdentifier(name: string): string {
        return name === 'minecraft:fish' ? 'minecraft:cod' : name;
    }

    public entityTypes(): readonly string[] {
        return ['minecraft:pig', 'minecraft:player', 'minecraft:armor_stand'];
    }

    public experience(id: string): ScriptExperience | undefined {
        return this.record(id)?.experience;
    }

    public setExperience(id: string, experience: ScriptExperience): void {
        const record = this.record(id);
        if (record !== undefined) record.experience = experience;
    }

    public spawnPoint(id: string): ScriptDimensionLocation | undefined {
        return this.record(id)?.spawnPoint;
    }

    public setSpawnPoint(id: string, point: ScriptDimensionLocation | undefined): void {
        const record = this.record(id);
        if (record === undefined) return;
        if (point === undefined) delete record.spawnPoint;
        else record.spawnPoint = point;
    }

    public permissions(id: string) {
        const record = this.record(id);
        return record === undefined ? undefined : { command: record.commandLevel ?? 0, player: 1 };
    }

    public setCommandPermissionLevel(id: string, level: number): void {
        const record = this.record(id);
        if (record !== undefined) record.commandLevel = level;
    }

    public sendClient(player: string, message: ScriptClientMessage): void {
        this.sent.push({ player, message });
    }

    public clientInfo(id: string): ScriptClientInfo | undefined {
        if (this.record(id) === undefined) return undefined;
        return {
            locale: 'en_US',
            maxRenderDistance: 32,
            platformType: 'Desktop',
            graphicsMode: 'Fancy',
            inputMode: 'KeyboardAndMouse',
            touchOnlyAffectsHotbar: false,
            movement: { x: 0, y: 1 },
            jump: true,
            sneak: false,
            persistentId: `persistent-${id}`
        };
    }

    public playAnimation(): void {}

    public eat(): void {}

    public aimAssist(): ScriptAimAssistRegistry {
        return {
            categories: [
                {
                    identifier: 'minecraft:default',
                    defaultBlockPriority: 1,
                    defaultEntityPriority: 1,
                    blocks: { 'minecraft:lever': 60 },
                    entities: {},
                    blockTags: {},
                    entityTypeFamilies: {}
                }
            ],
            presets: [
                {
                    identifier: 'minecraft:aim_assist_default',
                    defaultItemSettings: 'minecraft:default',
                    excludedBlocks: ['minecraft:bedrock'],
                    excludedEntities: [],
                    excludedBlockTags: [],
                    excludedEntityTypeFamilies: [],
                    itemSettings: {},
                    liquidTargetingItems: []
                }
            ]
        };
    }

    public addAimAssist(added: ScriptAimAssistRegistry): void {
        this.added.push(added);
    }

    public enderChest(id: string): readonly (ScriptItem | null)[] | undefined {
        return this.record(id)?.enderChest;
    }

    public setEnderChestItem(id: string, slot: number, item: ScriptItem | undefined): void {
        const record = this.record(id);
        if (record !== undefined) record.enderChest[slot] = item ?? null;
    }
}

/** A {@link MemoryWorld} whose entities have systems. */
export class EntityMemoryWorld extends MemoryWorld {
    public readonly entitySystems = new MemoryEntitySystems(this);
}
