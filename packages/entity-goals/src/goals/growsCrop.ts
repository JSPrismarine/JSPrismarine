import { goal } from '../goal';
import { bodySchema, isRecord, numberAt } from '../params';
import type { GoalSupport } from '../support';
import type { JavaBlockState } from '../world';

/**
 * Java's `Bee$BeeGrowCropGoal`, which Bedrock writes as `minecraft:grows_crop` in the bee's
 * `has_nectar` group.
 *
 * A bee that carries nectar, has a hive to go back to and is not angry grows the crops one and
 * two blocks under it, up to `charges` growth steps between two visits to its hive. The goal
 * starts on 7 in 10 selector updates and then grows on one update in `adjustedTickDelay(30)`,
 * where Bedrock's `chance` would roll every tick: who grows what is the server's to decide, so
 * Java's numbers decide.
 */

/** The Java block tag of the blocks a bee grows. */
const BEE_GROWABLES = 'minecraft:bee_growables';

/** `canBeeUse` refuses on a `nextFloat()` under this. */
const REFUSE_BELOW = 0.3;

/** Selector updates between growths: `adjustedTickDelay(30)` of a goal ticked every other game tick. */
const GROW_ONE_IN = 15;

/** How many blocks below the bee it grows, `blockPosition().below(1)` and `below(2)`. */
const DEPTH = 2;

/** `Bee.isTooFarAway`: a hive this many blocks away or more is no longer the bee's. */
const HIVE_RANGE = 48;

/**
 * The age Java's `CropBlock.getMaxAge` gives each crop that `#minecraft:bee_growables` names
 * through `#minecraft:crops`. The pitcher crop is in the tag but is no `CropBlock`, so a bee
 * leaves it alone.
 */
const CROP_MAX_AGE: Readonly<Record<string, number>> = {
    'minecraft:wheat': 7,
    'minecraft:carrots': 7,
    'minecraft:potatoes': 7,
    'minecraft:beetroots': 3,
    'minecraft:torchflower_crop': 2
};

/** The stems, Java's `StemBlock`, which grow to age 7. */
const STEM_MAX_AGE = 7;
const STEMS: ReadonlySet<string> = new Set(['minecraft:pumpkin_stem', 'minecraft:melon_stem']);

/** `SweetBerryBushBlock.MAX_AGE`. */
const BERRY_BUSH_MAX_AGE = 3;

const CAVE_VINES: ReadonlySet<string> = new Set(['minecraft:cave_vines', 'minecraft:cave_vines_plant']);

/** What the declared body sets: the growth steps a bee has between two visits to its hive. */
interface GrowsCropParams {
    readonly charges: number;
}

/** The state with one more `age`, as the age property spells it. */
const aged = (state: JavaBlockState, age: number): JavaBlockState => ({
    name: state.name,
    properties: { ...state.properties, age: String(age) }
});

/**
 * What one bee visit makes of a block, Java's branches of `BeeGrowCropGoal.tick`, or undefined
 * when the block stays as it is.
 */
export const grownByBee = (state: JavaBlockState): JavaBlockState | undefined => {
    const age = Number(state.properties.age);
    const maxAge = CROP_MAX_AGE[state.name];
    if (maxAge !== undefined) {
        if (age >= maxAge) return undefined;
        // `TorchflowerCropBlock.getStateForAge(2)` is a grown torchflower.
        return state.name === 'minecraft:torchflower_crop' && age + 1 === maxAge
            ? { name: 'minecraft:torchflower', properties: {} }
            : aged(state, age + 1);
    }
    if (STEMS.has(state.name)) return age < STEM_MAX_AGE ? aged(state, age + 1) : undefined;
    if (state.name === 'minecraft:sweet_berry_bush') return age < BERRY_BUSH_MAX_AGE ? aged(state, age + 1) : undefined;
    // `CaveVines.performBonemeal`, on a vine `isValidBonemealTarget` accepts: one without berries.
    if (CAVE_VINES.has(state.name) && state.properties.berries === 'false')
        return { name: state.name, properties: { ...state.properties, berries: 'true' } };
    return undefined;
};

/** `Bee.isHiveValid`: a home within 48 blocks that is still one of the blocks `minecraft:home` lists. */
const hasValidHive = (support: GoalSupport): boolean => {
    const home = support.world.home?.();
    if (home === undefined) return false;
    const here = support.position();
    const dx = Math.floor(home.x) - Math.floor(here.x);
    const dy = Math.floor(home.y) - Math.floor(here.y);
    const dz = Math.floor(home.z) - Math.floor(here.z);
    if (dx * dx + dy * dy + dz * dz >= HIVE_RANGE * HIVE_RANGE) return false;
    const declared = support.entity.componentParams('minecraft:home');
    const list = isRecord(declared) ? declared['home_block_list'] : undefined;
    const block = support.world.blockAt?.(home)?.identifier;
    return block !== undefined && Array.isArray(list) && list.includes(block);
};

/** `minecraft:grows_crop`, run as Java's `Bee$BeeGrowCropGoal`. It holds no control flags, as Java's holds none. */
export const growsCrop = goal<GrowsCropParams>({
    name: 'minecraft:grows_crop',
    controlFlags: [],
    schema: bodySchema((body) => ({ charges: Math.max(0, Math.floor(numberAt(body, 'charges', 10))) })),
    create: (params, support) => {
        // The group that declares the component is the bee's nectar, so a new count starts with it,
        // as `Bee.dropOffNectar` resets Java's.
        let grown = 0;
        const canUse = (): boolean =>
            grown < params.charges &&
            support.random() >= REFUSE_BELOW &&
            !support.entity.hasComponent('minecraft:angry') &&
            hasValidHive(support);
        return {
            canStart: canUse,
            canContinue: canUse,
            tick: () => {
                if (support.randomInt(GROW_ONE_IN) !== 0) return;
                const here = support.position();
                for (let depth = 1; depth <= DEPTH; depth += 1) {
                    const position = { x: Math.floor(here.x), y: Math.floor(here.y) - depth, z: Math.floor(here.z) };
                    if (support.world.blockHasTag?.(position, BEE_GROWABLES) !== true) continue;
                    const state = support.world.javaBlockAt?.(position);
                    const grownState = state === undefined ? undefined : grownByBee(state);
                    if (grownState === undefined) continue;
                    support.world.setJavaBlock?.(position, grownState);
                    grown += 1;
                }
            }
        };
    }
});
