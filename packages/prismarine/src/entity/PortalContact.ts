import type { Vector3 } from '@jsprismarine/math';

/**
 * How many consecutive ticks inside a nether portal a traveler waits before it goes through.
 *
 * Java's `NetherPortalBlock.getPortalTransitionTime` returns 0 for anything that is not a player
 * and, for a player, the `players_nether_portal_default_delay` game rule (80) or
 * `players_nether_portal_creative_delay` (0) when the player is in creative. Bedrock's "one tick
 * in creative" is the same thing seen from the client.
 */
export const PORTAL_TRANSITION_TICKS = {
    /** A player in survival, adventure or spectator mode: four seconds. */
    player: 80,
    /** A creative player: goes through on the first contact tick. */
    creative: 0,
    /** An item, a mob, a projectile: goes through on the first contact tick. */
    other: 0
} as const;

/**
 * How long an entity refuses portals after a dimension change.
 *
 * Java's `Entity.getDimensionChangingDelay` is 300 ticks, and `Player` and `VehicleEntity`
 * return 10 instead, so a mob waits fifteen seconds and a player half a second. A vehicle
 * carrying a player takes the player's delay; that case arrives with vehicles.
 */
export const PORTAL_COOLDOWN_TICKS = {
    /** Fifteen seconds, which is what Bedrock writes to `PortalCooldown` on arrival. */
    entity: 300,
    /** Half a second, long enough to step out of the arrival portal. */
    player: 10
} as const;

/** How much `portalTime` drops for every tick spent outside the portal. */
const DECAY_PER_TICK = 4;

/**
 * One entity's running contact with a portal, as Java's `PortalProcessor` keeps it.
 *
 * The world calls {@link PortalContact.touch} on every tick the entity's box overlaps a portal
 * block, and the entity calls {@link PortalContact.tick} once per tick from its own update.
 * The time inside climbs by one per touched tick and drops by four per tick outside, so a
 * player who steps out and back in does not start over, and the entity drops the contact once
 * {@link PortalContact.hasExpired} says the time has run back down to zero.
 */
export class PortalContact {
    private portalTime = 0;
    private insideThisTick = false;
    private entryPosition: Vector3;

    /**
     * @param entryPosition - Where the entity stood when it first touched the portal.
     */
    public constructor(entryPosition: Vector3) {
        this.entryPosition = entryPosition;
    }

    /**
     * Records that the entity overlaps a portal block on the current tick.
     *
     * Several touches in one tick count once. The position is kept so the trip can be resolved
     * from where the entity stood, not from where it was when the contact began.
     */
    public touch(entryPosition: Vector3): void {
        this.insideThisTick = true;
        this.entryPosition = entryPosition;
    }

    /**
     * Advances the contact by one tick.
     *
     * @param delayTicks - Ticks inside the portal before the trip starts, from
     * {@link PORTAL_TRANSITION_TICKS}. Zero fires on the first tick.
     * @returns `true` when the time inside has reached `delayTicks` this tick.
     */
    public tick(delayTicks: number): boolean {
        if (this.insideThisTick) {
            this.insideThisTick = false;
            this.portalTime += 1;
            return this.portalTime >= delayTicks;
        }

        this.portalTime = Math.max(this.portalTime - DECAY_PER_TICK, 0);
        return false;
    }

    /**
     * Whether the time inside has run back down to zero, so the contact can be dropped.
     */
    public hasExpired(): boolean {
        return this.portalTime <= 0;
    }

    /** Ticks accumulated inside the portal, after decay. */
    public getPortalTime(): number {
        return this.portalTime;
    }

    /** Where the entity most recently stood in the portal. */
    public getEntryPosition(): Vector3 {
        return this.entryPosition;
    }
}
