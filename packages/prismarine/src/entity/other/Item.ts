import type { Vector3 } from '@jsprismarine/math';
import { ActorEvent } from '@jsprismarine/minecraft';
import type ContainerEntry from '../../inventory/ContainerEntry';
import type PlayerSession from '../../network/PlayerSession';
import { TakeItemActorPacket } from '../../network/Packets';
import { Entity } from '../Entity';

/** Blocks per tick an item gains falling, and what it keeps of its speed. Vanilla's figures. */
const GRAVITY = 0.04;
const DRAG = 0.02;

/**
 * How far below itself an item looks to decide it has landed. Small enough that it never
 * reaches into the block it is standing on top of, big enough to survive the rounding of a
 * position that arrived as a float.
 */
const GROUND_PROBE = 0.01;

/**
 * Ticks an item lies untouchable after it appears.
 *
 * Without it the block a player just broke would be back in their inventory before they ever
 * saw it fall, since they are standing right on top of it.
 */
const PICKUP_DELAY = 10;

/** How near a player has to be, in blocks, to take an item. */
const PICKUP_RANGE = 1.5;

/**
 * How near two stacks of the same thing have to be to become one.
 *
 * Wider than vanilla's, and deliberately. Vanilla merges stacks that are nearly touching, but
 * its dropped items are given a little horizontal speed and shove each other about, so two
 * from neighbouring blocks drift together within a second. This server drops items straight
 * down and leaves them where they land, so they sit exactly one block apart - for ever, at
 * half a block's reach. Until they move, the reach has to cover the spacing they are dropped
 * at, which is one block square and 1.41 diagonally.
 *
 * TODO: give a drop some horizontal motion and take this back to vanilla's half a block.
 */
const MERGE_RANGE = 1.5;

/**
 * How tall a player's body is.
 *
 * The reach is measured against that body rather than against the single point a player
 * reports, because the point a player reports is its eyes: `EYE_HEIGHT` is 1.62, and a stack
 * lying at their feet is therefore 1.62 away from it - already outside the 1.5 above. No
 * amount of standing on an item ever picked it up.
 */
const BODY_HEIGHT = 1.8;

export class Item extends Entity {
    public static MOB_ID = 'minecraft:item';
    private item?: ContainerEntry;

    /** Downward speed. Zero once it has settled, which is also how it knows it has. */
    private motionY = 0;

    /** Ticks since it appeared, counted only for {@link PICKUP_DELAY}. */
    private age = 0;

    /** Set the moment a player takes it, so two ticks cannot both collect the same stack. */
    private taken = false;

    public constructor({
        item,
        ...options
    }: ConstructorParameters<typeof Entity>[0] & {
        item?: ContainerEntry;
    }) {
        super(options);

        this.item = item;
    }

    /** What this entity is on the ground: the stack a player picks up. */
    public getItem(): ContainerEntry | undefined {
        return this.item;
    }

    /**
     * Dropped stacks are followed less far than anything else, as in vanilla.
     *
     * They are the most numerous entity in any world by a wide margin and the least worth
     * seeing at a distance: one mob farm produces more items than every mob and player put
     * together, and at the generic radius all of them stream to everyone nearby.
     * @returns {number} The tracking radius in chunks.
     */
    public override getTrackingRange(): number {
        return 6;
    }

    /**
     * An item moves once, when it drops, and then lies still.
     * @returns {number} The interval in ticks.
     */
    public override getTrackingInterval(): number {
        return 20;
    }

    /** A dropped stack goes on the wire as an item actor, not as a generic one. */
    public override async spawnTo(session: PlayerSession): Promise<void> {
        await session.sendAddItemActor(this);
    }

    public async update(tick: number) {
        await super.update(tick);
        if (this.taken) return;

        this.age++;
        await this.fall();
        await this.tryMerge();
        await this.tryPickup();
    }

    /**
     * Draws a neighbouring stack of the same thing into this one.
     *
     * Vanilla does this and it is not cosmetic: mining a seam of coal leaves a dozen separate
     * entities where there should be one, each ticking, each falling, each broadcast to every
     * player who comes near, and each needing its own trip through the pickup code.
     *
     * Only the older of a pair absorbs, decided by runtime id, so two entities meeting cannot
     * each swallow the other and leave two stacks where there was one.
     */
    private async tryMerge(): Promise<void> {
        const mine = this.item?.getItem();
        if (!mine || mine.getAmount() >= mine.getMaxAmount()) return;

        const position = this.getPosition();

        for (const other of this.getWorld().getEntityGrid().near(position.getX(), position.getZ())) {
            if (!(other instanceof Item) || other === this) continue;
            if (other.taken || other.getRuntimeId() < this.getRuntimeId()) continue;

            const theirs = other.item?.getItem();
            if (!theirs || theirs.getName() !== mine.getName() || theirs.meta !== mine.meta) continue;
            if (other.distanceTo(position) > MERGE_RANGE) continue;

            // All of it or none of it, which is what vanilla does: two stacks that will not
            // both fit are left as two. Moving part of one across leaves a remainder nobody
            // can see the reason for, and the client is told a stack size rather than a
            // difference - so a partial move has to be described twice to be believed.
            if (mine.getAmount() + theirs.getAmount() > mine.getMaxAmount()) continue;

            // Both counts, because an entity holds the number twice - once on the stack and
            // once on the entry around it - and the pickup path reads the entry's. Moving
            // only the stack's would hand the player the old number.
            mine.count += theirs.getAmount();
            this.item!.setCount(mine.count);

            // Claimed before the world is told, so the tick that removes it cannot also hand
            // it to a player who happens to be standing there.
            other.taken = true;
            await this.getWorld().removeEntity(other);

            // And the client is told the survivor grew.
            //
            // There is no packet that updates a dropped stack: `AddItemActor` carries the item
            // and is only sent when the entity appears. This event is the one way to say the
            // number changed, and without it the merge was invisible - two items became one on
            // the ground while the survivor still showed, and handed over, the count it was
            // dropped with.
            await this.getWorld().sendActorEvent(this, ActorEvent.UPDATE_STACK_SIZE, mine.getAmount());
        }
    }

    /**
     * Brings the item down to the first solid block under it, then leaves it alone.
     *
     * An item at rest does no work and sends nothing: without that check every stack ever
     * dropped would go on broadcasting its unchanged position to every player, forever.
     */
    private async fall(): Promise<void> {
        if (this.motionY === 0 && (await this.isSolidAt(this.getPosition().getY() - GROUND_PROBE))) return;

        this.motionY = (this.motionY - GRAVITY) * (1 - DRAG);
        const next = this.getPosition().getY() + this.motionY;

        if (await this.isSolidAt(next)) {
            // The step would end inside a block, so it comes to rest on top of that one
            // instead - landing on the surface rather than at wherever the step happened to
            // finish, which at this speed could be some way into the ground.
            this.motionY = 0;
            await this.setY(Math.floor(next) + 1);
            return;
        }

        await this.setY(next);
    }

    private async isSolidAt(y: number): Promise<boolean> {
        const position = this.getPosition();
        const block = await this.getWorld().getBlock(
            Math.floor(position.getX()),
            Math.floor(y),
            Math.floor(position.getZ())
        );

        return block.isSolid();
    }

    /**
     * Gives the stack to a player standing close enough, and takes the entity out of the
     * world.
     *
     * The client puts the item in its own inventory when it sees the take, so the animation
     * and the inventory both follow from the one packet.
     */
    private async tryPickup(): Promise<void> {
        if (!this.item || this.age < PICKUP_DELAY) return;

        const taker = this.getWorld()
            .getPlayers()
            .find((player) => this.reaches(player));
        if (!taker) return;

        // Claimed before the first await, so that a second tick cannot hand the same stack to
        // somebody else while this one is still sending packets.
        this.taken = true;

        // A full inventory leaves the stack where it is, rather than swallowing it: the claim
        // is given back so a later tick, or another player, can try again.
        if (taker.getInventory().addItem(this.item) > 0) {
            this.taken = false;
            return;
        }

        const pk = new TakeItemActorPacket();
        pk.itemRuntimeEntityId = this.getRuntimeId();
        pk.takerRuntimeEntityId = taker.getRuntimeId();

        // Both actors have to be known to the recipient: the packet animates the item flying
        // into the taker, and a client missing either one has nothing to draw.
        await Promise.all(
            this.getWorld()
                .getPlayers()
                .filter((player) => {
                    const session = player.getNetworkSession();
                    return session.tracks(this.getRuntimeId()) && session.tracks(taker.getRuntimeId());
                })
                .map(async (player) => player.getNetworkSession().send(pk))
        );

        // The take packet animates the stack flying in; it does not say what the inventory now
        // holds. Without this the item left the ground and the slot stayed empty on screen.
        await taker.getNetworkSession().sendInventory();

        await this.getWorld().removeEntity(this);
    }

    /** Straight line distance from this stack to a point. */
    private distanceTo(other: Vector3): number {
        const position = this.getPosition();

        return Math.hypot(
            position.getX() - other.getX(),
            position.getY() - other.getY(),
            position.getZ() - other.getZ()
        );
    }

    /**
     * Whether a player is close enough to take this stack.
     *
     * Measured to their body rather than to the point they report, which is their eyes. An
     * item lying at someone's feet is {@link EYE_HEIGHT} below that point - further than the
     * reach itself - so comparing against it meant nothing was ever in range, however
     * precisely a player stood on it.
     * @param {object} player - the candidate, asked only for where it is and where its feet are.
     * @returns {boolean} whether the stack is within reach.
     */
    private reaches(player: { getPosition: () => Vector3; getFeetY: () => number }): boolean {
        const position = this.getPosition();
        const eyes = player.getPosition();

        const feet = player.getFeetY();
        const head = feet + BODY_HEIGHT;

        // Zero while the stack is beside the body; only what lies beyond it counts.
        const dy = position.getY() < feet ? feet - position.getY() : Math.max(0, position.getY() - head);

        return Math.hypot(position.getX() - eyes.getX(), dy, position.getZ() - eyes.getZ()) <= PICKUP_RANGE;
    }
}
