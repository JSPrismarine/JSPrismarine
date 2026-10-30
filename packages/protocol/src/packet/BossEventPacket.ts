import { bossEventPacket } from '../wire/definitions/bossEvent';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * What the event does to the boss bar, as the `Event Type` byte numbers it.
 *
 * The docs spell the four update members with an underscore, such as `Update_Percent`.
 */
export enum BossEventUpdateType {
    Add = 0,
    PlayerAdded = 1,
    Remove = 2,
    PlayerRemoved = 3,
    UpdatePercent = 4,
    UpdateName = 5,
    UpdateProperties = 6,
    UpdateStyle = 7,
    Query = 8
}

/** The bar colors a boss bar can take, as the `Color` byte numbers them. */
export enum BossBarColor {
    Pink = 0,
    Blue = 1,
    Red = 2,
    Green = 3,
    Yellow = 4,
    Purple = 5,
    RebeccaPurple = 6,
    White = 7
}

/** How the bar is divided, as the `Overlay` byte numbers it. */
export enum BossBarOverlay {
    Progress = 0,
    Notched6 = 1,
    Notched10 = 2,
    Notched12 = 3,
    Notched20 = 4
}

/**
 * Adds, removes or updates the boss bar at the top of a player's screen.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `bossEventPacket` definition: `Target
 * Actor ID` as a ZigZag varint64, `Event Type` as a byte, `Name` and `FilteredName` as
 * strings, `Health Percent` as a float LE, then `Color` and `Overlay` as one byte each.
 *
 * Every field is present whatever the event type is. Up to protocol 2192 the packet also
 * carried a `Player ID` between the target and the event type, and only wrote the fields the
 * event type used. A reader that still expects that layout takes the event type for the first
 * byte of a ZigZag `Player ID` and misreads the rest of the packet.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/boss-event-packet/
 */
export default class BossEventPacket extends FieldNetworkPacket {
    /** The actor the bar belongs to. The client reads its health and name tag from this actor. */
    public targetActorId = 0n;

    public eventType: BossEventUpdateType = BossEventUpdateType.Add;

    /** The title shown above the bar. */
    public name = '';

    /** The title for a player with the profanity filter on. Empty to leave `name` in place. */
    public filteredName = '';

    /** How full the bar is, from 0 to 1. */
    public healthPercent = 0;

    public color: BossBarColor = BossBarColor.Pink;
    public overlay: BossBarOverlay = BossBarOverlay.Progress;

    /** Reads the target, the event type, and the bar's title, health and style. */
    public decodePayload(): void {
        const read = layoutAt(bossEventPacket, this.codecProtocol).decode(this);
        this.targetActorId = read.targetActorId;
        this.eventType = read.eventType;
        this.name = read.name;
        this.filteredName = read.filteredName;
        this.healthPercent = read.healthPercent;
        this.color = read.color;
        this.overlay = read.overlay;
    }

    /** Writes the target, the event type, and the bar's title, health and style. */
    public encodePayload(): void {
        layoutAt(bossEventPacket, this.codecProtocol).encode(this, {
            targetActorId: this.targetActorId,
            eventType: this.eventType,
            name: this.name,
            filteredName: this.filteredName,
            healthPercent: this.healthPercent,
            color: this.color,
            overlay: this.overlay
        });
    }
}
