import { Vector3 } from '@jsprismarine/math';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import FallingBlock from '../../entity/other/FallingBlock';
import { Position } from '../Position';
import type { World } from '../World';
import type { LiquidKind } from './BlockRules';
import { falls, isFalling, isWashedAway, liquidOf, needsSupport, spreadOf, FALLING_DEPTH_FLAG } from './BlockRules';

/**
 * What a block does when the world around it changes.
 *
 * Three rules, all reached the same way: something changed nearby, so this block is given one
 * chance to look at its own situation and act on it. Nothing here scans the world - the update
 * scheduler brings the work to the blocks that might care, which is what keeps the cost of physics
 * proportional to how much is actually happening rather than to how large the world is.
 *
 * Everything reads and writes only chunks already in memory. A cascade that reaches the edge of the
 * loaded world stops there rather than generating terrain to fall into, which is both much cheaper
 * and much less surprising.
 */

/** The four horizontal directions, which is where liquid spreads. */
const SIDES: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
];

export class BlockPhysics {
    public constructor(private readonly world: World) {}

    /**
     * Gives the block at a position one chance to react.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {number} now - The current tick, for scheduling anything that follows.
     */
    public async update(x: number, y: number, z: number, now: number): Promise<void> {
        const name = this.nameAt(x, y, z);
        if (name === null) return;

        const liquid = liquidOf(name);
        if (liquid) {
            await this.updateLiquid(liquid, x, y, z, now);
            return;
        }

        if (needsSupport(name) && !this.isSupported(x, y, z)) {
            await this.breakUnsupported(name, x, y, z, now);
            return;
        }

        if (falls(name) && this.canFallInto(x, y - 1, z)) {
            await this.fall(name, x, y, z, now);
        }
    }

    /** The block's state name, or null where nothing is loaded. */
    private nameAt(x: number, y: number, z: number): string | null {
        const chunk = this.world.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return null;

        return chunk.getBlock(x & 0xf, y, z & 0xf).name;
    }

    /** The `liquid_depth` of a liquid block, or null if it is not one. */
    private depthAt(x: number, y: number, z: number): number | null {
        const chunk = this.world.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return null;

        const state = chunk.getBlock(x & 0xf, y, z & 0xf);
        if (!liquidOf(state.name)) return null;

        return Number(state.properties['liquid_depth'] ?? 0);
    }

    /**
     * Whether something underneath will hold a plant up.
     *
     * Anything that is not air, not liquid and not itself washed away. Vanilla is fussier - wheat
     * wants farmland specifically - but a rule that strict would uproot a village's crops the
     * moment the farm was generated, and "something solid" is the part that matters here.
     */
    private isSupported(x: number, y: number, z: number): boolean {
        const below = this.nameAt(x, y - 1, z);

        // Unloaded ground is assumed to be holding it up. Refusing to guess is what stops a
        // plant at the edge of the loaded world from breaking for want of a chunk.
        if (below === null) return true;

        return below !== 'minecraft:air' && !isWashedAway(below) && liquidOf(below) === null;
    }

    /** Whether a falling block can move into this position. */
    private canFallInto(x: number, y: number, z: number): boolean {
        const name = this.nameAt(x, y, z);
        if (name === null) return false;

        return name === 'minecraft:air' || isWashedAway(name) || liquidOf(name) !== null;
    }

    /**
     * Takes an unsupported block out of the world, leaving it on the ground.
     *
     * Dropped rather than deleted, which is what makes mining under a field of wheat give you the
     * wheat. A block this server has no class for cannot be turned into an item, so it is simply
     * removed - losing the drop rather than the physics.
     */
    private async breakUnsupported(name: string, x: number, y: number, z: number, now: number): Promise<void> {
        await this.world.setBlockByName(x, y, z, 'minecraft:air', now);

        try {
            const block = this.world.getServer().getBlockManager().getBlock(name);
            await this.world.dropContents(new Vector3(x + 0.5, y + 0.5, z + 0.5), [block]);
        } catch {
            // Not a block this server models; it is gone either way.
        }
    }

    /**
     * Hands a block over to gravity.
     *
     * The block is taken out of the world and a {@link FallingBlock} put in its place, which falls
     * under its own acceleration and turns back into a block where it lands. Stepping the block
     * down through the world instead would be simpler, but a block is only ever in one place or
     * another - so it could only ever descend at a fixed one block per step, and sand would drift
     * down rather than drop.
     */
    private async fall(name: string, x: number, y: number, z: number, now: number): Promise<void> {
        await this.world.setBlockByName(x, y, z, 'minecraft:air', now);

        // Centred in the column it fell from, so it lands back in the same one.
        const entity = new FallingBlock({
            position: new Position(x + 0.5, y, z + 0.5, this.world),
            blockName: name
        });

        await this.world.addEntity(entity);
    }

    /**
     * Spreads a liquid, or dries it up.
     *
     * The vanilla shape, simplified: a source feeds outward, each block one step thinner than the
     * one that fed it, until it runs out of reach. Downward is different and deliberately so -
     * liquid falls at full strength, which is why a waterfall stays a waterfall however tall it is,
     * and why water finding a hole goes down it instead of spreading across the floor.
     */
    private async updateLiquid(liquid: LiquidKind, x: number, y: number, z: number, now: number): Promise<void> {
        const depth = this.depthAt(x, y, z) ?? 0;
        const source = depth === 0;

        // Flowing liquid with nothing feeding it any more is the tail of a river whose source has
        // gone. Without this, breaking a source leaves the whole stream behind it hanging.
        if (!source && !this.hasSupply(liquid, x, y, z, depth)) {
            await this.world.setBlockByName(x, y, z, 'minecraft:air', now);
            return;
        }

        // Downwards first, and if it goes down it does not also spread sideways.
        if (this.canFlowInto(liquid, x, y - 1, z, FALLING_DEPTH_FLAG)) {
            await this.place(liquid, x, y - 1, z, FALLING_DEPTH_FLAG, now);
            return;
        }

        // Nothing left to fall into is not the same as standing on ground. A block partway down a
        // waterfall cannot flow down - the shaft below it is already full - but it must not spread
        // sideways either, or every level of the fall becomes a sheet of water reaching outwards,
        // each block of which then falls and starts a sheet of its own. That is the difference
        // between a waterfall and a cave filling floor to ceiling, and between a few hundred block
        // writes and a hundred thousand.
        //
        // A source is exempt, which is what lets one placed in mid air flow down and then, five
        // ticks later, out to its four sides.
        if (!source && this.holdsLiquid(liquid, x, y - 1, z)) return;

        // Falling liquid spreads at full strength once it lands; everything else one step thinner.
        const next = spreadOf(depth) + 1;
        if (next > liquid.reach) return;

        for (const [dx, dz] of SIDES) {
            if (!this.canFlowInto(liquid, x + dx, y, z + dz, next)) continue;
            await this.place(liquid, x + dx, y, z + dz, next, now);
        }
    }

    /**
     * Whether anything is still feeding this block.
     *
     * Fed from above by liquid falling into it, or from the side by liquid that is closer to a
     * source than this block is. Comparing spread rather than merely "is liquid" is what stops two
     * equally thin blocks from holding each other up forever after their source is gone.
     */
    private hasSupply(liquid: LiquidKind, x: number, y: number, z: number, depth: number): boolean {
        const above = this.nameAt(x, y + 1, z);
        if (above !== null && (above === liquid.still || above === liquid.flowing)) return true;

        const mine = spreadOf(depth);
        for (const [dx, dz] of SIDES) {
            const neighbour = this.depthAt(x + dx, y, z + dz);
            if (neighbour === null) continue;

            const name = this.nameAt(x + dx, y, z + dz);
            if (name !== liquid.still && name !== liquid.flowing) continue;

            // Falling liquid beside it counts as a supply whatever its nominal spread.
            if (isFalling(neighbour) || spreadOf(neighbour) < mine) return true;
        }

        return false;
    }

    /**
     * Whether a position is somewhere this liquid could be, rather than ground it has to run over.
     *
     * Air and the liquid itself both hold it; anything solid does not. Unloaded counts as solid, so
     * a pool at the edge of the loaded world still spreads rather than waiting for a chunk that may
     * never arrive.
     */
    private holdsLiquid(liquid: LiquidKind, x: number, y: number, z: number): boolean {
        const name = this.nameAt(x, y, z);
        if (name === null) return false;

        return isWashedAway(name) || name === liquid.still || name === liquid.flowing;
    }

    /** Whether liquid should move into a position at the given depth. */
    private canFlowInto(liquid: LiquidKind, x: number, y: number, z: number, depth: number): boolean {
        const name = this.nameAt(x, y, z);
        if (name === null) return false;

        if (isWashedAway(name)) return true;

        // Already this liquid: worth replacing only if the new flow is stronger, which is what
        // stops two blocks from rewriting each other every tick forever.
        if (name === liquid.still || name === liquid.flowing) {
            const existing = this.depthAt(x, y, z) ?? 0;
            if (existing === 0) return false;

            return spreadOf(depth) < spreadOf(existing) && !isFalling(existing);
        }

        return false;
    }

    /** Puts flowing liquid at a position and queues it to spread onwards. */
    private async place(
        liquid: LiquidKind,
        x: number,
        y: number,
        z: number,
        depth: number,
        now: number
    ): Promise<void> {
        const runtimeId = BlockRuntimeIds.tryGetByState(liquid.flowing, { liquid_depth: depth });
        if (runtimeId === null) return;

        await this.world.setBlockRuntimeId(x, y, z, runtimeId, now, liquid.spreadDelay);
    }
}

export default BlockPhysics;
