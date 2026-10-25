import { GameRules } from '../../world/GameRuleManager';
import { Entity } from '../Entity';
import { explode } from '../Explosion';
import { MetadataFlag } from '../Metadata';

/**
 * Lit TNT on its fuse.
 *
 * Java's `PrimedTnt`. A TNT block never explodes where it stands: lighting it clears the block
 * and puts this entity in its place, and the entity is the only thing that counts the fuse and
 * sets the blast off. Everything that lights TNT - flint and steel, a redstone signal, fire, and
 * another blast - goes through here, which is also what makes a chain a chain rather than one
 * big simultaneous explosion.
 *
 * The client animates the flashing and the countdown from {@link MetadataFlag.FUSE_TIME} and the
 * ignited flag, so an entity whose fuse is only counted server-side looks like a dropped block
 * and then kills you.
 */

/** Java's `PrimedTnt.DEFAULT_FUSE_TIME`: four seconds. */
export const DEFAULT_FUSE_TICKS = 80;

/** Java's `PrimedTnt.DEFAULT_EXPLOSION_POWER`, which is the blast radius. */
export const TNT_EXPLOSION_POWER = 4;

/**
 * Blocks per tick the fuse gains upward when it is lit, and what gravity and drag do to it.
 *
 * Java's `PrimedTnt` constructor sets a delta movement of 0.2 up, and its tick applies the
 * entity default gravity of 0.04 and air drag of 0.98. The TNT therefore hops about half a
 * block and is back down after roughly twenty ticks, well inside a full fuse.
 */
const LAUNCH_SPEED = 0.2;
const GRAVITY = 0.04;
const AIR_DRAG = 0.98;

/**
 * Java's `PrimedTnt.getRandomShortFuse`, which is the fuse a blast gives the TNT it catches.
 *
 * `nextInt(max(1, fuse / 4)) + fuse / 8`, so a default fuse of 80 becomes 10 to 29 ticks. The
 * spread is what makes a chain ripple outward instead of going off as one blast.
 *
 * @param fuse - The fuse the TNT would otherwise have had.
 * @param random - A draw in `[0, 1)`.
 * @returns The shortened fuse, in ticks.
 */
export const randomShortFuse = (fuse: number = DEFAULT_FUSE_TICKS, random: number = Math.random()): number =>
    Math.floor(random * Math.max(1, Math.floor(fuse / 4))) + Math.floor(fuse / 8);

export default class Tnt extends Entity {
    public static MOB_ID = 'minecraft:tnt';

    /** Ticks left before it goes off. Counted down before the test, as Java counts it. */
    private fuse: number;

    /** Where it was lit, which is the floor it falls back to. */
    private readonly restingY: number;

    /** Upward speed in blocks per tick; starts positive and turns over under gravity. */
    private motionY = LAUNCH_SPEED;

    /** Set the tick it goes off, so a second update cannot detonate the same TNT twice. */
    private spent = false;

    /**
     * Who is answerable for the blast, Java's `PrimedTnt.owner`.
     *
     * Carried through a chain, so every TNT a player's first blast sets off still kills in
     * that player's name rather than nobody's.
     */
    private readonly source: Entity | null;

    public constructor({
        fuse = DEFAULT_FUSE_TICKS,
        source = null,
        ...options
    }: ConstructorParameters<typeof Entity>[0] & { fuse?: number; source?: Entity | null }) {
        super(options);

        this.fuse = Math.max(0, Math.trunc(fuse));
        this.source = source;
        this.restingY = options.position.getY();

        this.metadata.setInt(MetadataFlag.FUSE_TIME, this.fuse);
        this.metadata.setIgnited(true);
    }

    /** Ticks left on the fuse. */
    public getFuse(): number {
        return this.fuse;
    }

    /** Falls a step and burns a tick of fuse, and sets the blast off when the fuse runs out. */
    public override async update(tick: number): Promise<void> {
        await super.update(tick);
        if (this.spent) return;

        await this.fall();

        // Java decrements first and tests the new value, so a fuse of 80 goes off on the
        // eightieth tick rather than the eighty-first.
        this.fuse -= 1;
        this.metadata.setInt(MetadataFlag.FUSE_TIME, Math.max(0, this.fuse));
        if (this.fuse > 0) return;

        this.spent = true;
        await this.detonate();
    }

    /**
     * The hop Java's TNT makes, bounded below by the height it was lit at.
     *
     * The floor is the position it was spawned at rather than a block read, because the block
     * it was lit from has just been cleared and the only surface it can land on is the one it
     * was standing on. TNT lit over a hole therefore hangs where Java would have let it drop.
     */
    private async fall(): Promise<void> {
        this.motionY = (this.motionY - GRAVITY) * AIR_DRAG;

        const next = this.getPosition().getY() + this.motionY;
        if (next <= this.restingY) {
            if (this.getPosition().getY() === this.restingY) return;
            this.motionY = 0;
            await this.setY(this.restingY);
            return;
        }

        await this.setY(next);
    }

    /**
     * Goes off, and takes itself with it.
     *
     * Java's `PrimedTnt.explode`: radius 4 from the entity's own position, gated on the
     * `tntexplodes` game rule, with the entity removed before the blast so it cannot be caught
     * by its own knockback. The y offset Java adds is `getY(0.0625)`, a sixteenth of the body
     * height, which puts the center just inside the block the TNT is resting on.
     */
    private async detonate(): Promise<void> {
        const world = this.getWorld();
        await world.removeEntity(this);

        const [allowed] = world.getGameRuleManager().getGameRule(GameRules.TNTExplodes) ?? [true];
        if (!allowed) return;

        const position = this.getPosition();
        await explode(world, position.withY(this.getFeetY() + 0.0625), {
            power: TNT_EXPLOSION_POWER,
            source: this.source ?? this
        });
    }
}
