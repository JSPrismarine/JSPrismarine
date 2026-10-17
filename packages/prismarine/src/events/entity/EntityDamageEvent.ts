import type { DamageSource } from '../../entity/DamageSource';
import type { Entity } from '../../entity/Entity';
import { Event } from '../Event';

/**
 * Fired just before an entity is hurt, and before anything has been taken off its health.
 *
 * Cancellable, and the amount is writable, so a plugin can make a region safe or a mob tougher
 * without having to intercept every source of damage separately. The amount here is the *raw*
 * blow: armour, enchantments and resistance have not been applied yet, which is what makes it
 * the useful number to change - doubling it doubles the hit as a player would understand it,
 * rather than undoing whatever their armour was about to do.
 */
export default class EntityDamageEvent extends Event {
    private readonly entity: Entity;
    private readonly source: DamageSource;
    private amount: number;

    public constructor(entity: Entity, amount: number, source: DamageSource) {
        super();

        this.entity = entity;
        this.amount = amount;
        this.source = source;
    }

    /** Who is being hurt. */
    public getEntity(): Entity {
        return this.entity;
    }

    /** The blow, before any reduction. */
    public getAmount(): number {
        return this.amount;
    }

    /**
     * Change the blow.
     * @param {number} amount - The new amount; anything at or below zero cancels the hit outright.
     */
    public setAmount(amount: number): void {
        this.amount = amount;
    }

    /** What did it, and who is answerable for it. */
    public getSource(): DamageSource {
        return this.source;
    }
}
