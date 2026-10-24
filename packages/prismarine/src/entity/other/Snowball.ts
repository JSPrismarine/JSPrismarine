import type { Entity } from '../Entity';
import { Projectile } from './Projectile';

/**
 * A snowball.
 *
 * Hurts nothing and shoves everything, which is the whole of what it is for - see
 * {@link Projectile.shoveAndVanish} for why that cannot go through the damage pipeline.
 */

/** Heavier than an arrow, which is why a snowball drops away so much sooner. */
const GRAVITY = 0.03;
const DRAG = 0.99;

/** A nudge: enough to be felt, not enough to move anybody far. */
const SHOVE = 0.4;

export default class Snowball extends Projectile {
    public static MOB_ID = 'minecraft:snowball';

    public override getType(): string {
        return Snowball.MOB_ID;
    }

    protected override get gravity(): number {
        return GRAVITY;
    }

    protected override get drag(): number {
        return DRAG;
    }

    protected override hit(target: Entity): Promise<boolean> {
        return this.hitAsync(target);
    }

    private async hitAsync(target: Entity): Promise<boolean> {
        return this.shoveAndVanish(target, SHOVE);
    }
}
