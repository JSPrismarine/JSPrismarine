/**
 * A small voxel world that implements {@link WorldActions}, for testing a
 * family end to end.
 *
 * It is a real implementation rather than a mock: blocks go in a map, writes
 * are readable back, and every effect a behavior produces is recorded in
 * order so a test asserts on what happened instead of on which method was
 * called. Chance comes off a queue, so a probabilistic rule can be driven to
 * either outcome without patching a global.
 */
import type { BlockFace, BlockPosition, BlockStateValue, HookBlock } from '@jsprismarine/blocks';
import { DEFAULT_LIGHT_DAMPENING } from '@jsprismarine/blocks';

import { AIR } from './identifiers';
import type {
    BlockEntityData,
    BlockProperties,
    BlockStates,
    BlockWorld,
    ItemDrop,
    WorldActions,
    WorldEntity
} from './world';
import { DEFAULT_BLOCK_PROPERTIES } from './world';

/** The dimension a {@link VoxelWorld} uses when a test names none. */
export const OVERWORLD = 'minecraft:overworld';

/** One item stack a behavior dropped. */
export interface RecordedDrop {
    readonly position: BlockPosition;
    readonly drop: ItemDrop;
}

/** One sound or particle a behavior emitted. */
export interface RecordedEffect {
    readonly position: BlockPosition;
    /** The sound event or particle name. */
    readonly name: string;
}

/** One tick a behavior asked for. */
export interface RecordedTick {
    readonly position: BlockPosition;
    /** Game ticks from the request to the tick. */
    readonly delay: number;
}

/** One entity a behavior spawned, still listed after it is removed. */
export interface RecordedEntity {
    readonly id: number;
    readonly identifier: string;
    readonly position: BlockPosition;
    readonly data: BlockEntityData | undefined;
    /** True once {@link WorldActions.removeEntity} took it out of the world. */
    removed: boolean;
}

const keyOf = (position: BlockPosition): string => `${position.x},${position.y},${position.z}`;

interface StoredBlock {
    readonly identifier: string;
    readonly states: BlockStates;
}

/**
 * One dimension of a {@link VoxelWorld}.
 *
 * The seeding methods (`set`, `fill`, `addEntity`, `setPower`, `setLight`,
 * `defineProperties`, `queueRandom`) are the test's half of the interface;
 * the rest is {@link WorldActions} as a behavior sees it.
 */
export class VoxelDimension implements WorldActions {
    /** Every item stack dropped, in order. */
    public readonly drops: RecordedDrop[] = [];
    /** Every sound played, in order. */
    public readonly sounds: RecordedEffect[] = [];
    /** Every particle emitted, in order. */
    public readonly particles: RecordedEffect[] = [];
    /** Every tick requested, in order. */
    public readonly scheduled: RecordedTick[] = [];
    /** Every entity spawned, in order, including removed ones. */
    public readonly entities: RecordedEntity[] = [];
    /** Every position whose neighbors were notified, in order. */
    public readonly notified: BlockPosition[] = [];

    private readonly blocks = new Map<string, StoredBlock>();
    private readonly unloaded = new Set<string>();
    private readonly blockData = new Map<string, BlockEntityData>();
    private readonly power = new Map<string, number>();
    private readonly signals = new Map<string, number>();
    private readonly directSignals = new Map<string, number>();
    private readonly redstoneConductors = new Set<string>();
    private readonly light = new Map<string, number>();
    private readonly lightDampening = new Map<string, number>();
    private readonly properties = new Map<string, BlockProperties>();
    private readonly randoms: number[] = [];
    private seed = 1;

    /** @param name - The dimension identifier blocks in it report. */
    public constructor(public readonly name: string) {}

    /** Puts a block in the world without running any behavior. */
    public set(position: BlockPosition, identifier: string, states: BlockStates = {}): void {
        if (identifier === AIR) this.blocks.delete(keyOf(position));
        else this.blocks.set(keyOf(position), { identifier, states });
    }

    /** Puts the same block in every position of an inclusive box. */
    public fill(from: BlockPosition, to: BlockPosition, identifier: string, states: BlockStates = {}): void {
        for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x += 1) {
            for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += 1) {
                for (let z = Math.min(from.z, to.z); z <= Math.max(from.z, to.z); z += 1) {
                    this.set({ x, y, z }, identifier, states);
                }
            }
        }
    }

    /** The block at a position, with air for a position nothing wrote. */
    public block(position: BlockPosition): HookBlock {
        const stored = this.blocks.get(keyOf(position));
        return {
            identifier: stored?.identifier ?? AIR,
            position,
            dimension: this.name,
            states: stored?.states ?? {}
        };
    }

    /** The identifier at a position, with {@link AIR} for an empty one. */
    public identifierAt(position: BlockPosition): string {
        return this.blocks.get(keyOf(position))?.identifier ?? AIR;
    }

    /** One state value at a position. */
    public stateAt(position: BlockPosition, name: string): BlockStateValue | undefined {
        return this.blocks.get(keyOf(position))?.states[name];
    }

    /**
     * Makes a position read as unloaded, which is what the server reports past the edge of the
     * chunks it holds.
     *
     * A behavior that treats an unloaded position as air gives a different answer at a chunk
     * border than it does in the middle of one, and this is how a test says so.
     */
    public unload(position: BlockPosition): void {
        this.unloaded.add(keyOf(position));
    }

    /** Puts an entity in the world without spawning it through a behavior. */
    public addEntity(identifier: string, position: BlockPosition, data?: BlockEntityData): number {
        const id = this.entities.length + 1;
        this.entities.push({ id, identifier, position, data, removed: false });
        return id;
    }

    /** Sets the redstone power {@link WorldActions.redstonePower} reports. */
    public setPower(position: BlockPosition, level: number): void {
        this.power.set(keyOf(position), level);
    }

    /** Sets the directional weak redstone signal {@link WorldActions.redstoneSignal} reports. */
    public setSignal(position: BlockPosition, directionToSource: BlockFace, level: number): void {
        this.signals.set(`${keyOf(position)}|${directionToSource}`, level);
    }

    /** Sets the directional strong signal {@link WorldActions.redstoneDirectSignal} reports. */
    public setDirectSignal(position: BlockPosition, directionToSource: BlockFace, level: number): void {
        this.directSignals.set(`${keyOf(position)}|${directionToSource}`, level);
    }

    /** Sets whether a position carries redstone power through its direct signal. */
    public setRedstoneConductor(position: BlockPosition, conductor = true): void {
        if (conductor) this.redstoneConductors.add(keyOf(position));
        else this.redstoneConductors.delete(keyOf(position));
    }

    /** Sets the light level {@link WorldActions.lightLevel} reports; unset positions read 15. */
    public setLight(position: BlockPosition, level: number): void {
        this.light.set(keyOf(position), level);
    }

    /** Sets the `minecraft:light_dampening` value a block type reports. */
    public defineLightDampening(identifier: string, value: number): void {
        this.lightDampening.set(identifier, value);
    }

    /** Gives a block type the `jsprismarine:block_properties` the world reports for it. */
    public defineProperties(identifier: string, properties: Partial<BlockProperties>): void {
        this.properties.set(identifier, { ...DEFAULT_BLOCK_PROPERTIES, ...properties });
    }

    /** Queues the next values {@link WorldActions.random} returns, in order. */
    public queueRandom(...values: readonly number[]): void {
        this.randoms.push(...values);
    }

    /** The block at a position, with air for an unwritten one and undefined for an unloaded one. */
    public getBlock(position: BlockPosition): HookBlock | undefined {
        if (this.unloaded.has(keyOf(position))) return undefined;
        return this.block(position);
    }

    /** Writes a block, which is what a behavior does to the world. */
    public setBlock(position: BlockPosition, identifier: string, states: BlockStates = {}): void {
        this.set(position, identifier, states);
    }

    /** The properties a test gave a block type, or the component defaults. */
    public propertiesOf(identifier: string): BlockProperties {
        return this.properties.get(identifier) ?? DEFAULT_BLOCK_PROPERTIES;
    }

    /** The light dampening a test gave a block type, or the vanilla default. */
    public lightDampeningOf(block: HookBlock): number {
        return this.lightDampening.get(block.identifier) ?? (block.identifier === AIR ? 0 : DEFAULT_LIGHT_DAMPENING);
    }

    /** Records a drop. */
    public dropItem(position: BlockPosition, drop: ItemDrop): void {
        this.drops.push({ position, drop });
    }

    /** Records a spawn and returns the id it can be removed by. */
    public spawnEntity(position: BlockPosition, identifier: string, data?: BlockEntityData): number {
        return this.addEntity(identifier, position, data);
    }

    /** Marks an entity gone, keeping it in the recorded list. */
    public removeEntity(entity: number): void {
        const found = this.entities.find((candidate) => candidate.id === entity);
        if (found !== undefined) found.removed = true;
    }

    /** Every entity still in the world whose position floors to this block. */
    public entitiesAt(position: BlockPosition): readonly WorldEntity[] {
        return this.entities
            .filter(
                (entity) =>
                    !entity.removed &&
                    Math.floor(entity.position.x) === position.x &&
                    Math.floor(entity.position.y) === position.y &&
                    Math.floor(entity.position.z) === position.z
            )
            .map((entity) => ({ id: entity.id, identifier: entity.identifier, position: entity.position }));
    }

    /** Records a sound. */
    public playSound(position: BlockPosition, sound: string): void {
        this.sounds.push({ position, name: sound });
    }

    /** Records a particle. */
    public spawnParticle(position: BlockPosition, particle: string): void {
        this.particles.push({ position, name: particle });
    }

    /** Records a tick request. */
    public scheduleTick(position: BlockPosition, delay: number): void {
        this.scheduled.push({ position, delay });
    }

    /** The block entity data at a position. */
    public getBlockData(position: BlockPosition): BlockEntityData | undefined {
        return this.blockData.get(keyOf(position));
    }

    /** Replaces the block entity data at a position. */
    public setBlockData(position: BlockPosition, data: BlockEntityData): void {
        this.blockData.set(keyOf(position), data);
    }

    /** Records a neighbor notice. */
    public notifyNeighbors(position: BlockPosition): void {
        this.notified.push(position);
    }

    /** The power a test set at a position, or none. */
    public redstonePower(position: BlockPosition): number {
        return this.power.get(keyOf(position)) ?? 0;
    }

    /** Whether this voxel fixture marks the tick as part of the current batch. */
    public willTickThisTick(_position: BlockPosition): boolean {
        return false;
    }

    /** The directional signal a test set, or the power reading for this position. */
    public redstoneSignal(position: BlockPosition, directionToSource: BlockFace): number {
        return this.signals.get(`${keyOf(position)}|${directionToSource}`) ?? this.redstonePower(position);
    }

    /** The directional strong signal a test set, or its weak signal. */
    public redstoneDirectSignal(position: BlockPosition, directionToSource: BlockFace): number {
        return (
            this.directSignals.get(`${keyOf(position)}|${directionToSource}`) ??
            this.redstoneSignal(position, directionToSource)
        );
    }

    /** Whether a test marked a position as conducting redstone. */
    public redstoneConductor(position: BlockPosition): boolean {
        return this.redstoneConductors.has(keyOf(position));
    }

    /** The light a test set at a position, or full daylight. */
    public lightLevel(position: BlockPosition): number {
        return this.light.get(keyOf(position)) ?? 15;
    }

    /** The next queued chance value, then a repeatable sequence. */
    public random(): number {
        const queued = this.randoms.shift();
        if (queued !== undefined) return queued;
        this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
        return this.seed / 2147483648;
    }
}

/** A {@link BlockWorld} made of {@link VoxelDimension}s, created on first use. */
export class VoxelWorld implements BlockWorld {
    private readonly dimensions = new Map<string, VoxelDimension>();

    /** The dimension by name, created empty the first time it is asked for. */
    public at(dimension: string = OVERWORLD): VoxelDimension {
        const known = this.dimensions.get(dimension);
        if (known !== undefined) return known;
        const created = new VoxelDimension(dimension);
        this.dimensions.set(dimension, created);
        return created;
    }

    /** The overworld, which is the dimension a test uses unless it names another. */
    public get overworld(): VoxelDimension {
        return this.at(OVERWORLD);
    }
}

/** Builds an empty {@link VoxelWorld}. */
export const createVoxelWorld = (): VoxelWorld => new VoxelWorld();
