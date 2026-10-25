import FallingBlock from '../../entity/other/FallingBlock';
import { Position } from '../Position';
import { destroyBlock } from '../blockDestroy';
import type { World } from '../World';
import { falls, isWashedAway, liquidOf, needsSupport } from './BlockRules';

/**
 * What a block does when the world around it changes.
 *
 * Two rules, both reached the same way: something changed nearby, so this block is given one
 * chance to look at its own situation and act on it. Nothing here scans the world - the update
 * scheduler brings the work to the blocks that might care, which is what keeps the cost of physics
 * proportional to how much is actually happening rather than to how large the world is.
 *
 * Everything reads and writes only chunks already in memory. A cascade that reaches the edge of the
 * loaded world stops there rather than generating terrain to fall into, which is both much cheaper
 * and much less surprising.
 *
 * Liquid used to be the third rule and is not any more. `@jsprismarine/engine-systems` carries
 * Java's own `FlowingFluid`, drains its tick list from the world tick, and would have fought this
 * class over every block of water: two spread models writing the same `liquid_depth` on two
 * different clocks. Liquid still decides the other two rules - a plant does not stand on water,
 * and sand falls into it - so the rules this class reads about it stay.
 */

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

        if (needsSupport(name) && !this.isSupported(x, y, z)) {
            await this.breakUnsupported(x, y, z, now);
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
     * wheat. Through the same destruction every other path takes, so the hook runs before the
     * write - a chest that lost its support spills - and Java's table decides what falls; see
     * {@link import('../blockDestroy')}. A block the server has no catalog entry for leaves
     * nothing, which loses the drop rather than the physics.
     */
    private async breakUnsupported(x: number, y: number, z: number, now: number): Promise<void> {
        destroyBlock({ world: this.world, position: { x, y, z } });
        await this.world.setBlockByName(x, y, z, 'minecraft:air', now);
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

        // Centered in the column it fell from, so it lands back in the same one.
        const entity = new FallingBlock({
            position: new Position(x + 0.5, y, z + 0.5, this.world),
            blockName: name
        });

        await this.world.addEntity(entity);
    }
}

export default BlockPhysics;
