import type { Entity } from '../Entity';
import { Projectile } from './Projectile';

/**
 * A thrown egg.
 *
 * The same flight and the same harmless shove as a snowball. Vanilla's two thrown trinkets differ
 * only in what they do on landing, and hatching a chicken one time in eight is not modelled yet.
 */
const GRAVITY = 0.03;
const DRAG = 0.99;
const SHOVE = 0.4;

export default class Egg extends Projectile {
    public static MOB_ID = 'minecraft:egg';

    protected override get gravity(): number {
        return GRAVITY;
    }

    protected override get drag(): number {
        return DRAG;
    }

    protected override async hit(target: Entity): Promise<boolean> {
        return this.shoveAndVanish(target, SHOVE);
    }
}
