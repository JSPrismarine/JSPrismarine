import type Player from '../../Player';
import { Vector3 } from '@jsprismarine/math';
import { ActorEvent } from '@jsprismarine/minecraft';
import { advancementPickedUpItem } from '../../advancement/triggers';
import type ContainerEntry from '../../inventory/ContainerEntry';
import type PlayerSession from '../../network/PlayerSession';
import { TakeItemActorPacket } from '@jsprismarine/protocol';
import { Entity } from '../Entity';

/**
 * How an item moves, as a Bedrock Dedicated Server 1.26.52 moves one.
 *
 * Measured from the positions it sent for dropped and thrown items, tick by tick: each tick the
 * item gains {@link GRAVITY} downward, moves, then keeps {@link AIR_DRAG} of its speed, or
 * sideways and on the ground {@link GROUND_DRAG}. A fall from rest covers 0.04, 0.0792, 0.1176
 * blocks, each step 0.98 of the last plus 0.04.
 */
const GRAVITY = 0.04;
const AIR_DRAG = 0.98;
const GROUND_DRAG = 0.588;

/** Sideways speed below which an item has stopped sliding. */
const SLIDE_STOP = 1e-4;

/**
 * How far above where an item lies its position is, as BDS reports it.
 *
 * Every position BDS sent for an item, spawn and movement alike, was this much higher than where
 * the item rests: one lying on a block at y = 63 is reported at 64.125. The position held here is
 * the reported one, so it goes on the wire and into the saved `Pos` as it is, and
 * {@link Item.getFeetY} is where the item lies.
 */
export const ITEM_POSITION_OFFSET = 0.125;

/**
 * How far below its feet an item looks to decide it has landed. Small enough that it never
 * reaches into the block it is standing on top of, big enough to survive the rounding of a
 * position that arrived as a float.
 */
const GROUND_PROBE = 0.01;

/** How many ticks a normal world drop waits before a player can pick it up. */
const DEFAULT_PICKUP_DELAY = 10;

/** How long a dropped stack stays in the world, matching Java's five-minute item age. */
const DESPAWN_AGE = 6000;

/** How near a player has to be, in blocks, to take an item. */
const PICKUP_RANGE = 1.5;

/**
 * How near two stacks of the same thing have to be to become one, in blocks.
 *
 * Half a block: on a Bedrock Dedicated Server 1.26.52 two dropped stacks merged once they had
 * slid to within about 0.3 of each other. Stacks from neighboring blocks get that close because
 * a drop leaves its block at a random spot with a little sideways speed; see
 * `World.dropFromBlock`.
 */
const MERGE_RANGE = 0.5;

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

    /** Speed in blocks per tick. All zero once it has settled, which is also how it knows it has. */
    private motion: Vector3;

    /** Ticks since it appeared, counted toward despawning. */
    private age = 0;

    /** Ticks left before a player may take it. Java gives player drops forty ticks. */
    private pickupDelay: number;

    /** Set the moment a player takes it, so two ticks cannot both collect the same stack. */
    private taken = false;

    /**
     * @param options - The entity's options, and the stack's own.
     * @param options.item - The stack it is.
     * @param options.age - Ticks it has already lain in the world, for a stack read from a save.
     * @param options.motion - The speed it starts with, in blocks per tick; still by default.
     * @param options.pickupDelay - Ticks before a player may take it; normal drops wait ten.
     */
    public constructor({
        item,
        age = 0,
        motion = new Vector3(0, 0, 0),
        pickupDelay = DEFAULT_PICKUP_DELAY,
        ...options
    }: ConstructorParameters<typeof Entity>[0] & {
        item?: ContainerEntry;
        age?: number;
        motion?: Vector3;
        pickupDelay?: number;
    }) {
        super(options);

        this.item = item;
        this.age = age;
        this.motion = motion;
        this.pickupDelay = pickupDelay;
    }

    /** The speed it is moving at, in blocks per tick, which the client is told when it appears. */
    public getMotion(): Vector3 {
        return this.motion;
    }

    /**
     * Where the item lies, {@link ITEM_POSITION_OFFSET} below the position it reports.
     * @returns {number} The height of the bottom of the stack.
     */
    public override getFeetY(): number {
        return this.getPosition().getY() - ITEM_POSITION_OFFSET;
    }

    /** What this entity is on the ground: the stack a player picks up. */
    public getItem(): ContainerEntry | undefined {
        return this.item;
    }

    /** The number of ticks this dropped stack has spent in a loaded chunk. */
    public getAge(): number {
        return this.age;
    }

    /** Ticks left before a player may take the stack. */
    public getPickupDelay(): number {
        return this.pickupDelay;
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
     * An item moves for about a second after it drops, sliding a block or so, and then lies
     * still.
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
        if (this.age >= DESPAWN_AGE) {
            await this.getWorld().removeEntity(this);
            return;
        }
        if (this.pickupDelay > 0) this.pickupDelay--;

        await this.move();
        await this.tryMerge();
        await this.tryPickup();
    }

    /**
     * Draws a neighboring stack of the same thing into this one.
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

        for (const other of this.getWorld().getEntityGrid().nearItems(position.getX(), position.getZ(), MERGE_RANGE)) {
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
     * Moves the item one tick, in the order BDS does: gravity, then the move, then drag.
     *
     * It stops against a block sideways and comes to rest on top of the first solid block below.
     * An item at rest does no work and sends nothing: without that check every stack ever
     * dropped would go on broadcasting its unchanged position to every player, forever.
     */
    private async move(): Promise<void> {
        const position = this.getPosition();
        const feet = this.getFeetY();
        const still = this.motion.getX() === 0 && this.motion.getY() === 0 && this.motion.getZ() === 0;
        if (still && (await this.isSolidAt(position.getX(), feet - GROUND_PROBE, position.getZ()))) return;

        let motionX = this.motion.getX();
        let motionY = this.motion.getY() - GRAVITY;
        let motionZ = this.motion.getZ();

        let x = position.getX() + motionX;
        if (await this.isSolidAt(x, feet, position.getZ())) {
            x = position.getX();
            motionX = 0;
        }
        let z = position.getZ() + motionZ;
        if (await this.isSolidAt(x, feet, z)) {
            z = position.getZ();
            motionZ = 0;
        }

        let nextFeet = feet + motionY;
        const landed = await this.isSolidAt(x, nextFeet, z);
        if (landed) {
            // The step would end inside a block, so it comes to rest on top of that one
            // instead - landing on the surface rather than at wherever the step happened to
            // finish, which at this speed could be some way into the ground.
            nextFeet = Math.floor(nextFeet) + 1;
            motionY = 0;
        }

        const sideways = landed ? GROUND_DRAG : AIR_DRAG;
        motionX *= sideways;
        motionZ *= sideways;
        if (Math.abs(motionX) < SLIDE_STOP) motionX = 0;
        if (Math.abs(motionZ) < SLIDE_STOP) motionZ = 0;
        this.motion = new Vector3(motionX, motionY * AIR_DRAG, motionZ);

        const next = new Vector3(x, nextFeet + ITEM_POSITION_OFFSET, z);
        if (next.equals(position)) return;
        await this.setPosition({ position: next });
    }

    private async isSolidAt(x: number, y: number, z: number): Promise<boolean> {
        const block = await this.getWorld().getBlock(Math.floor(x), Math.floor(y), Math.floor(z));

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
        if (!this.item || this.pickupDelay > 0) return;

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

        // Here rather than in the inventory, which has no idea whose it is.
        // This is how nearly every "get this item" advancement is earned: Java
        // has no block-break trigger, so breaking stone earns
        // `story/mine_stone` through the cobblestone landing in a slot.
        advancementPickedUpItem(taker, this.item.toItemStack());

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
    private reaches(player: Player): boolean {
        const position = this.getPosition();
        const lying = this.getFeetY();
        const eyes = player.getPosition();

        const feet = player.getFeetY();
        const head = feet + BODY_HEIGHT;

        // Zero while the stack is beside the body; only what lies beyond it counts.
        const dy = lying < feet ? feet - lying : Math.max(0, lying - head);

        return Math.hypot(position.getX() - eyes.getX(), dy, position.getZ() - eyes.getZ()) <= PICKUP_RANGE;
    }
}
