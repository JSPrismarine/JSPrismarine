import type { JavaBehavior, JavaBehaviorKind } from './javaRegistryClasses.ts';
import { javaBehaviorsOf, javaClassIsA, javaInterfacesOf, javaRegisteredClassOf } from './javaRegistryClasses.ts';

/**
 * Java Edition's block classes, read out of the pinned server jar: which class each block id
 * constructs, and which of `BlockBehaviour`'s hooks that class overrides.
 *
 * A block's behavior lives in the hooks its class overrides. A crafting table overrides
 * `useWithoutItem`, a torch `canSurvive`, a pressure plate `entityInside` and `getSignal`. Reading
 * the overrides from the class file gives every block the rows its Java behavior needs, whether or
 * not the server has a family for it yet, and a new hook in a Java release adds the row.
 */

const BLOCK_PACKAGE = 'net/minecraft/world/level/block/';
/** The plain block every other block class extends; the hooks it declares are the defaults. */
const BASE_BLOCK = `${BLOCK_PACKAGE}Block`;

/** `Blocks`, whose initializer registers every block. */
const BLOCKS = {
    owner: `${BLOCK_PACKAGE}Blocks`,
    entryPackages: [BLOCK_PACKAGE],
    helpers: {
        register: BASE_BLOCK,
        registerStair: `${BLOCK_PACKAGE}StairBlock`,
        registerLegacyStair: `${BLOCK_PACKAGE}StairBlock`,
        registerSlab: `${BLOCK_PACKAGE}SlabBlock`,
        registerWall: `${BLOCK_PACKAGE}WallBlock`
    },
    fallback: BASE_BLOCK
};

/**
 * The binary name of the class a Java block runs, such as
 * `net/minecraft/world/level/block/CraftingTableBlock` for `minecraft:crafting_table`, or
 * undefined when the registrations name no class for it.
 *
 * A block of a colored or weathering family is found by its base name: `minecraft:red_wool` by
 * the `WOOL` collection, `minecraft:waxed_exposed_cut_copper` by `CUT_COPPER`.
 */
export const javaBlockClassOf = (javaId: string): string | undefined => javaRegisteredClassOf(BLOCKS, javaId);

/**
 * The behavior kinds a Java block class can add to the plain block, by the hooks of
 * `BlockBehaviour` and `Block` that carry them and the interfaces that mark them.
 *
 * Hooks that only shape rendering or the client's view (`skipRendering`, `animateTick`,
 * `getShadeBrightness`, `getVisualShape`) carry no server behavior and are not listed, and
 * `randomTick` is left to the property dump's `randomTick` flag, which the `random-tick` aspect
 * already reads.
 */
export const JAVA_BLOCK_BEHAVIOR_KINDS: readonly JavaBehaviorKind[] = [
    {
        aspect: 'interaction',
        description: 'what using or hitting it does',
        hooks: ['useWithoutItem', 'useItemOn', 'attack']
    },
    { aspect: 'scheduled-tick', description: 'what its scheduled ticks do', hooks: ['tick'] },
    { aspect: 'support', description: 'where it can stay and when it breaks off', hooks: ['canSurvive'] },
    {
        aspect: 'neighbor-update',
        description: 'how it reacts to its neighbors changing and to being placed or removed',
        hooks: ['updateShape', 'neighborChanged', 'onPlace', 'affectNeighborsAfterRemoval']
    },
    {
        aspect: 'placement',
        description: 'the state it is placed in and what a placement into it does',
        hooks: ['getStateForPlacement', 'setPlacedBy', 'canBeReplaced']
    },
    {
        aspect: 'redstone',
        description: 'the redstone signal it gives or the comparator reading it has',
        hooks: ['getSignal', 'getDirectSignal', 'isSignalSource', 'getAnalogOutputSignal']
    },
    {
        aspect: 'entity-contact',
        description: 'what it does to an entity inside it, walking on it or falling on it',
        hooks: ['entityInside', 'stepOn', 'fallOn', 'updateEntityMovementAfterFallOn']
    },
    { aspect: 'projectile', description: 'what a projectile hitting it does', hooks: ['onProjectileHit'] },
    {
        aspect: 'breaking',
        description: 'what breaking it or blowing it up does beyond its drops',
        hooks: ['playerWillDestroy', 'playerDestroy', 'spawnAfterBreak', 'onExplosionHit', 'wasExploded']
    },
    {
        aspect: 'block-entity',
        description: 'what its block entity holds and does',
        interfaces: [`${BLOCK_PACKAGE}EntityBlock`]
    },
    {
        aspect: 'bonemeal',
        description: 'what bone meal does to it',
        interfaces: [`${BLOCK_PACKAGE}BonemealableBlock`]
    },
    { aspect: 'falling', description: 'falling when nothing holds it up', interfaces: [`${BLOCK_PACKAGE}Fallable`] },
    {
        aspect: 'waterlogging',
        description: 'holding water and how water flows into and out of it',
        interfaces: [`${BLOCK_PACKAGE}SimpleWaterloggedBlock`, `${BLOCK_PACKAGE}LiquidBlockContainer`]
    }
];

/**
 * The behavior kinds a Java block's class adds to the plain block: each hook it or a superclass
 * below `Block` overrides with code, and each marker interface it implements.
 */
export const javaBlockBehaviors = (javaId: string): readonly JavaBehavior[] => {
    const className = javaBlockClassOf(javaId);
    return className === undefined ? [] : javaBehaviorsOf(className, [BASE_BLOCK], JAVA_BLOCK_BEHAVIOR_KINDS);
};

/** Whether a Java block class is, or extends, the class with this simple name, such as `AirBlock`. */
export const javaBlockIsA = (javaId: string, simple: string): boolean => javaClassIsA(javaBlockClassOf(javaId), simple);

/** Whether a Java block implements `EntityBlock`, which Java's piston refuses to move. */
export const javaBlockHasBlockEntity = (javaId: string): boolean => {
    const className = javaBlockClassOf(javaId);
    return className !== undefined && javaInterfacesOf(className).has(`${BLOCK_PACKAGE}EntityBlock`);
};
