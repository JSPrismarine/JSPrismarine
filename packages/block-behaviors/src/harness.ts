/**
 * Binding one family and dispatching hooks at it, which is how the tests
 * reach a behavior.
 *
 * The harness goes through {@link familyBehavior}, so a test exercises the
 * same `create` path the `BehaviorRegistry` runs rather than calling a
 * handler directly. Every event is built from the world's current block at
 * the position, so a test seeds the world and then names a position.
 */
import type {
    BlockFace,
    BlockHookName,
    BlockHooks,
    BlockPosition,
    BlockStateValue,
    FaceLocation,
    HookActor,
    HookBlock,
    HookItem
} from '@jsprismarine/blocks';
import type { Definition } from '@jsprismarine/content';

import type { BlockFamily } from './family';
import { familyBehavior } from './family';
import { offset } from './geometry';
import type { VoxelDimension, VoxelWorld } from './voxelWorld';
import { createVoxelWorld, OVERWORLD } from './voxelWorld';
import type { BlockStates } from './world';

/** How a harness builds the definition and picks the world and dimension. */
export interface HarnessOptions {
    /** The world to bind against; a fresh empty one when absent. */
    readonly world?: VoxelWorld;
    /** The dimension events report, defaulting to the overworld. */
    readonly dimension?: string;
    /** The block definition's `components`, such as `jsprismarine:block_properties`. */
    readonly components?: Readonly<Record<string, unknown>>;
}

/** The player a harness uses when a test names none. */
export const TEST_PLAYER: HookActor = { identifier: 'minecraft:player', position: { x: 0, y: 0, z: 0 } };

/**
 * A held item built from an identifier and a component map, which is all a
 * block behavior reads off one.
 *
 * It ships with the harness because a test for waxing, scraping, shearing or
 * silk touch needs a `HookItem` and nothing smaller exists. A server passes
 * its own `ItemStack` instead; both satisfy the same interface.
 */
export class TestItem implements HookItem {
    /**
     * @param identifier - The namespaced item identifier.
     * @param components - The item's components, keyed by name, as the
     *   schemas parse them.
     */
    public constructor(
        public readonly identifier: string,
        private readonly components: Readonly<Record<string, unknown>> = {}
    ) {}

    /** One component's value, or undefined when the item does not carry it. */
    public get(name: string): unknown {
        return this.components[name];
    }
}

/** A held item for a test, from an identifier and its components. */
export const heldItem = (identifier: string, components: Readonly<Record<string, unknown>> = {}): TestItem =>
    new TestItem(identifier, components);

/** A tool enchanted with silk touch, which is what makes glass, ice and leaves drop themselves. */
export const silkTouchTool = (identifier = 'minecraft:diamond_pickaxe'): TestItem =>
    heldItem(identifier, { 'minecraft:enchantments': { 'minecraft:silk_touch': 1 } });

/** What a test says about a placement beyond the block that is now there. */
export interface PlaceOptions {
    /** Who placed it. Absent means {@link TEST_PLAYER}; undefined means the world did. */
    readonly placedBy?: HookActor | undefined;
    /** What the placement overwrote, which the merging families read. */
    readonly previous?: { readonly identifier: string; readonly states?: BlockStates };
    /** The item the placement came out of. */
    readonly itemStack?: HookItem;
    /** The face of the block the new one went against, which picks a pillar's axis. */
    readonly face?: BlockFace;
    /**
     * Where on that face the click landed, each component in [0, 1]. Absent
     * with a face given means the middle of the face.
     */
    readonly faceLocation?: FaceLocation;
}

/** The middle of a block face, which is where a test clicks when it says nothing else. */
const FACE_CENTER: FaceLocation = { x: 0.5, y: 0.5, z: 0.5 };

/** Builds the definition a block type would resolve from, for one identifier. */
export const testDefinition = (identifier: string, components: Readonly<Record<string, unknown>> = {}): Definition => ({
    identifier,
    registry: 'blocks',
    pack: 'test',
    path: `blocks/${identifier.replace(/^[^:]*:/, '')}.block.json`,
    data: {
        format_version: '1.26.20',
        'minecraft:block': { description: { identifier }, components }
    }
});

/** One family bound to one block identifier, with a hook dispatcher per hook. */
export class FamilyHarness {
    /** The world the family acts on. */
    public readonly world: VoxelWorld;
    /** The dimension the events report, which is where the blocks live. */
    public readonly dimension: VoxelDimension;

    private readonly handlers: Partial<BlockHooks>;

    public constructor(
        public readonly family: BlockFamily,
        public readonly identifier: string,
        options: HarnessOptions = {}
    ) {
        this.world = options.world ?? createVoxelWorld();
        this.dimension = this.world.at(options.dimension ?? OVERWORLD);
        this.handlers = familyBehavior(family, this.world).create({
            identifier,
            definition: testDefinition(identifier, options.components)
        });
    }

    /** Whether the family implements a hook, so a test can tell silence from absence. */
    public implements(hook: BlockHookName): boolean {
        return this.handlers[hook] !== undefined;
    }

    /** The block at a position as the hooks see it. */
    public block(position: BlockPosition): HookBlock {
        return this.dimension.block(position);
    }

    /**
     * Dispatches `onPlace` for the block now at the position.
     *
     * @param options - `previous` is what the placement overwrote, which a
     *   slab merge and a candle stack read. Leaving `placedBy` out uses
     *   {@link TEST_PLAYER}; passing it as undefined is a world placement.
     *   `face` and `faceLocation` are the click a pillar, a slab and a pair
     *   of stairs read; naming a face with no location clicks its middle.
     */
    public place(position: BlockPosition, options: PlaceOptions = {}): void {
        const placedBy = 'placedBy' in options ? options.placedBy : TEST_PLAYER;
        this.handlers.onPlace?.({
            block: this.block(position),
            previous:
                options.previous === undefined
                    ? undefined
                    : {
                          identifier: options.previous.identifier,
                          position,
                          dimension: this.dimension.name,
                          states: options.previous.states ?? {}
                      },
            placedBy,
            itemStack: options.itemStack,
            face: options.face,
            faceLocation: options.face === undefined ? undefined : (options.faceLocation ?? FACE_CENTER)
        });
    }

    /**
     * Dispatches `onBreak`, with the block as it was before the break.
     *
     * @param options - What the breaker held, which decides silk touch and
     *   shears, and who broke it. Absent `brokenBy` is {@link TEST_PLAYER}.
     */
    public breakBlock(
        position: BlockPosition,
        options: { readonly brokenBy?: HookActor | undefined; readonly itemStack?: HookItem } = {}
    ): void {
        const broken = this.block(position);
        this.dimension.set(position, 'minecraft:air');
        this.handlers.onBreak?.({
            block: broken,
            brokenBlock: broken,
            brokenBy: 'brokenBy' in options ? options.brokenBy : TEST_PLAYER,
            itemStack: options.itemStack
        });
    }

    /** Dispatches `onNeighborChanged` for the neighbor on a face. */
    public neighborChanged(position: BlockPosition, face: BlockFace, neighbor?: HookBlock): void {
        this.handlers.onNeighborChanged?.({
            block: this.block(position),
            face,
            neighbor: neighbor ?? this.block(offset(position, face))
        });
    }

    /** Dispatches `onRandomTick`. */
    public randomTick(position: BlockPosition, tick = 0): void {
        this.handlers.onRandomTick?.({ block: this.block(position), tick });
    }

    /** Dispatches `onRandomTick` a number of times, which is how a growth rule is driven. */
    public randomTicks(position: BlockPosition, times: number): void {
        for (let index = 0; index < times; index += 1) this.randomTick(position, index);
    }

    /** Dispatches `onTick`, which is the scheduled tick a behavior asked for. */
    public tick(position: BlockPosition, tick = 0): void {
        this.handlers.onTick?.({ block: this.block(position), tick });
    }

    /**
     * Dispatches `onPlayerInteract` and returns whether the family consumed it.
     *
     * @param options - `itemStack` is what the player held, which decides
     *   waxing, scraping, filling and lighting; absent is a bare hand.
     */
    public interact(
        position: BlockPosition,
        options: {
            readonly player?: HookActor;
            readonly face?: BlockFace;
            readonly faceLocation?: FaceLocation;
            readonly itemStack?: HookItem;
        } = {}
    ): boolean | undefined {
        return this.handlers.onPlayerInteract?.({
            block: this.block(position),
            player: options.player ?? TEST_PLAYER,
            face: options.face,
            faceLocation: options.faceLocation,
            itemStack: options.itemStack
        });
    }

    /** Dispatches `onStepOn`. */
    public stepOn(position: BlockPosition, entity: HookActor = TEST_PLAYER): void {
        this.handlers.onStepOn?.({ block: this.block(position), entity });
    }

    /** Dispatches `onEntityFallOn`. */
    public fallOn(position: BlockPosition, fallDistance: number, entity: HookActor = TEST_PLAYER): void {
        this.handlers.onEntityFallOn?.({ block: this.block(position), entity, fallDistance });
    }

    /** Dispatches `onRedstoneUpdate` with the power now reaching the block. */
    public redstone(position: BlockPosition, power: number): void {
        this.handlers.onRedstoneUpdate?.({ block: this.block(position), power });
    }

    /** Dispatches `onBlockStateChange` for one state that changed in place. */
    public stateChange(
        position: BlockPosition,
        state: string,
        previousValue: BlockStateValue,
        newValue: BlockStateValue
    ): void {
        this.handlers.onBlockStateChange?.({ block: this.block(position), state, previousValue, newValue });
    }
}

/** Binds a family to one identifier against a world, ready to dispatch hooks. */
export const bindFamily = (family: BlockFamily, identifier: string, options: HarnessOptions = {}): FamilyHarness =>
    new FamilyHarness(family, identifier, options);
