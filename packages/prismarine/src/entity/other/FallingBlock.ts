import { Vector3 } from '@jsprismarine/math';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { Entity } from '../Entity';
import { MetadataFlag } from '../Metadata';

/**
 * A block on its way down.
 *
 * Sand and gravel fall, and how they fall is most of what makes them feel like matter: they start
 * slowly and are moving fast by the time they land. Moving the block itself a step at a time cannot
 * do that - a block is either in one place or another, so its speed is fixed at one block per
 * whatever the step is. Only an entity has a position between blocks to accelerate through.
 *
 * The client renders this as the block it carries, taken from `VARIANT`, and interpolates its
 * movement like any other entity - so the acceleration the server computes is the acceleration seen.
 */

/**
 * Blocks per tick gained each tick, and what is kept of the speed after.
 *
 * Vanilla's figures for a falling block, which are not the ones for an item or a mob: 0.04 and a
 * two percent drag settle at a terminal velocity a little under two blocks a tick, so a long drop
 * ends up travelling roughly forty blocks a second.
 */
const GRAVITY = 0.04;
const DRAG = 0.02;

/**
 * How far it may fall before being given up on.
 *
 * A block falling into ungenerated space, or down a shaft that reaches the world floor, would
 * otherwise fall for ever - and go on costing a movement packet to every player each tick while it
 * did.
 */
const MAX_FALL = 512;

export default class FallingBlock extends Entity {
    public static MOB_ID = 'minecraft:falling_block';

    /** The block this is, and will become again when it lands. */
    private readonly blockName: string;

    /** Downward speed, in blocks per tick. Negative; accelerates as it falls. */
    private motionY = 0;

    /** Where it started, so a fall with no end can be recognised as one. */
    private readonly startY: number;

    /** Set the moment it lands, so two ticks cannot both place the same block. */
    private settled = false;

    public constructor({
        blockName,
        ...options
    }: ConstructorParameters<typeof Entity>[0] & {
        blockName: string;
    }) {
        super(options);

        this.blockName = blockName;
        this.startY = options.position.getY();

        // What the client draws it as. Without it the entity is an invisible falling nothing.
        const runtimeId = BlockRuntimeIds.tryGetByName(blockName);
        if (runtimeId !== null) this.metadata.setInt(MetadataFlag.VARIANT, runtimeId);

        this.metadata.setAffectedByGravity(true);
        this.metadata.setCollidable(false);
    }

    /** The block it will leave behind. */
    public getBlockName(): string {
        return this.blockName;
    }

    /** Its current downward speed, for tests: the point of the entity is that this grows. */
    public getMotionY(): number {
        return this.motionY;
    }

    public override async update(tick: number): Promise<void> {
        await super.update(tick);
        if (this.settled) return;

        this.motionY = (this.motionY - GRAVITY) * (1 - DRAG);

        const position = this.getPosition();
        const next = position.getY() + this.motionY;

        // Fallen out of the world, or into space nobody has generated: it is not coming back.
        if (position.getY() - this.startY < -MAX_FALL || next < this.getWorld().getDimension().minY) {
            this.settled = true;
            await this.getWorld().removeEntity(this);
            return;
        }

        if (await this.isBlocked(next)) {
            await this.land(Math.floor(next) + 1);
            return;
        }

        await this.setY(next);
    }

    /** Whether the position it is about to occupy is already taken by something solid. */
    private async isBlocked(y: number): Promise<boolean> {
        const position = this.getPosition();

        const state = await this.getWorld().getBlockState(
            Math.floor(position.getX()),
            Math.floor(y),
            Math.floor(position.getZ())
        );

        // Anything a liquid would wash away is something this can fall through too - a block
        // dropping onto a flower flattens it rather than perching on it.
        return !FallingBlock.canFallThrough(state.name);
    }

    /**
     * Turns back into a block.
     *
     * If the place it came to rest will not take a block - it landed on top of something in a
     * space already occupied - it is dropped as an item instead, which is what vanilla does and
     * what stops a fall from quietly destroying the block.
     */
    private async land(y: number): Promise<void> {
        this.settled = true;

        const position = this.getPosition();
        const x = Math.floor(position.getX());
        const z = Math.floor(position.getZ());

        await this.getWorld().removeEntity(this);

        const resting = await this.getWorld().getBlockState(x, y, z);
        if (FallingBlock.canFallThrough(resting.name)) {
            await this.getWorld().setBlockByName(x, y, z, this.blockName);
            return;
        }

        try {
            const block = this.getServer().getBlockManager().getBlock(this.blockName);
            await this.getWorld().dropContents(new Vector3(x + 0.5, y + 0.5, z + 0.5), [block]);
        } catch {
            // Not a block this server models as an item; it is gone either way.
        }
    }

    /** Whether a block is something this can pass through rather than land on. */
    private static canFallThrough(name: string): boolean {
        return FALL_THROUGH.has(name);
    }
}

/**
 * What a falling block passes through rather than lands on.
 *
 * Kept here rather than taken from the liquid rules in `world/physics`: those describe what a
 * *liquid* washes away, which is nearly but not quite the same list - a falling block does not pass
 * through water, it lands in it.
 */
const FALL_THROUGH: ReadonlySet<string> = new Set([
    'minecraft:air',
    'minecraft:short_grass',
    'minecraft:tall_grass',
    'minecraft:fern',
    'minecraft:large_fern',
    'minecraft:deadbush',
    'minecraft:dandelion',
    'minecraft:poppy',
    'minecraft:red_flower',
    'minecraft:yellow_flower',
    'minecraft:wheat',
    'minecraft:carrots',
    'minecraft:potatoes',
    'minecraft:beetroot',
    'minecraft:torch',
    'minecraft:snow_layer'
]);
