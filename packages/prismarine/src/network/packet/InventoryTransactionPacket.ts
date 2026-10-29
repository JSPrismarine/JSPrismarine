import type BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { Item } from '../../item/Item';
import type BlockPosition from '../../world/BlockPosition';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** The docs' `ItemUseActionType`: what the client did with the item in hand. */
export enum ItemUseActionType {
    /** Clicked a block with the item. */
    PLACE,
    /** Clicked the air with the item. */
    USE,
    /** Broke a block. */
    DESTROY,
    /** A swing with the item at nothing in particular. */
    USE_AS_ATTACK = 3
}

/**
 * The docs' `ItemUseOnActorActionType`: what a client meant by clicking on an entity.
 *
 * A melee attack arrives here rather than in `InteractPacket`. That packet carries mounting,
 * dismounting and opening a villager's trades. Everything that comes out of swinging at
 * something comes through this transaction.
 */
export enum ItemUseOnActorActionType {
    /** Right-clicked the entity for its regular interaction. */
    INTERACT,
    /** Hit it. */
    ATTACK,
    /** Used the held item directly on the entity, as with spawn eggs. */
    ITEM_INTERACT
}

/**
 * The docs' `ItemReleaseActionType`: why a held item was let go of.
 */
export enum ItemReleaseActionType {
    /** The docs' Release: a bow fired, or a held item let go of. */
    RELEASE,
    /** The docs' Use: a crossbow finished charging. */
    USE
}

/**
 * The Transaction variant index, the docs' `ComplexInventoryTransaction::Type`.
 *
 * It selects which body follows the Actions list. Normal and Mismatch have no body of
 * their own. A 2193 client moves items between slots through `ItemStackRequestPacket`, so
 * what it still sends here is `USE_ITEM`, `USE_ITEM_ON_ENTITY` and `RELEASE_ITEM`.
 */
export enum TransactionType {
    NORMAL,
    MISMATCH,
    USE_ITEM,
    USE_ITEM_ON_ENTITY,
    RELEASE_ITEM
}

/** Which hand an item was used from. The docs' `HandSlot`. */
export enum HandSlot {
    MAINHAND,
    OFFHAND
}

/**
 * The docs' runtime constraint on the Actions list: "Verify that the number of
 * InventoryActions does not exceed 100". The reader refuses a longer list before
 * allocating it.
 */
export const MAX_INVENTORY_ACTIONS = 100;

/**
 * One of the docs' Legacy Set Item Slots: a Container Enum (uint8) and its Slots
 * (varuint count, then one uint8 per slot).
 *
 * The client sends these alongside a valid Legacy Request ID to say which open containers and
 * slots the request touches.
 */
export class LegacySlotChange {
    public constructor(
        public containerId: number,
        public slots: number[]
    ) {}

    /** Reads one entry in the docs' order: Container Enum, then the Slots list. */
    public static fromNetwork(stream: BinaryStream): LegacySlotChange {
        const containerId = stream.readByte();
        const slotCount = stream.readUnsignedVarInt();
        const slots = Array.from(stream.read(slotCount));
        return new LegacySlotChange(containerId, slots);
    }

    /** The mirror of {@link LegacySlotChange.fromNetwork}. */
    public toNetwork(stream: BinaryStream): void {
        stream.writeByte(this.containerId);
        stream.writeUnsignedVarInt(this.slots.length);
        stream.write(Buffer.from(this.slots));
    }
}

/**
 * The docs' `InventorySourceType`: which inventory an action's slot belongs to.
 *
 * The docs name five: Container Inventory, Global Inventory, World Interaction, Creative
 * Inventory and Non Implemented Feature TODO. Every member is a wire value; a source the
 * client sends that is not one of these stays on the action as the number it was, and the
 * handler drops the transaction.
 */
export enum InventorySourceType {
    /** Container Inventory. */
    CONTAINER,
    /** Global Inventory. */
    GLOBAL,
    /** World Interaction. */
    WORLD,
    /** Creative Inventory. */
    CREATIVE,
    /**
     * Non Implemented Feature TODO.
     *
     * The 2193 docs page lists this as 4 because the schema carries no values and the page
     * numbers such members in order. The 2207 page's changelog "changes" it to 99999, the
     * value gophertunnel and PocketMine have read and written at every protocol, and the one
     * the client sends.
     */
    NON_IMPLEMENTED_TODO = 99999
}

/**
 * One of the docs' Actions: a slot that changes, with the item it held before and after.
 *
 * Wire order is Source Type (varuint), Container ID (optional int8), Bit Flags (optional
 * varuint), Slot (varuint), From Item, To Item. The two optionals each carry their own
 * presence byte.
 */
export class InventoryAction {
    public constructor(
        /** The docs' Source Type, as read. An {@link InventorySourceType} when the client sent a known one. */
        public sourceType: number,
        public windowId: number | null,
        public sourceFlags: number | null,
        public targetSlot: number,
        public oldItem: Item,
        public newItem: Item
    ) {}

    /**
     * Reads one action.
     *
     * The Container ID and the Bit Flags are each an optional with its own presence byte. Up
     * to protocol 748 the reader inferred their presence from the Source Type. The client still
     * sets each byte by that rule (a container has a Container ID, the world has Bit Flags),
     * but the byte is what is on the wire, and a reader that infers instead of reading is one
     * field off as soon as the two disagree. The Container ID is a single signed byte, where it
     * used to be a varint.
     */
    public static fromNetwork(stream: BinaryStream): InventoryAction {
        const sourceType = stream.readUnsignedVarInt();
        const windowId = stream.readBoolean() ? stream.readSignedByte() : null;
        const sourceFlags = stream.readBoolean() ? stream.readUnsignedVarInt() : null;
        return new InventoryAction(
            sourceType,
            windowId,
            sourceFlags,
            stream.readUnsignedVarInt(),
            Item.networkDeserialize(stream),
            Item.networkDeserialize(stream)
        );
    }

    /** The mirror of {@link InventoryAction.fromNetwork}. */
    public toNetwork(stream: BinaryStream): void {
        stream.writeUnsignedVarInt(this.sourceType);
        stream.writeBoolean(this.windowId !== null);
        if (this.windowId !== null) stream.writeSignedByte(this.windowId);
        stream.writeBoolean(this.sourceFlags !== null);
        if (this.sourceFlags !== null) stream.writeUnsignedVarInt(this.sourceFlags);
        stream.writeUnsignedVarInt(this.targetSlot);
        this.oldItem.networkSerialize(stream);
        this.newItem.networkSerialize(stream);
    }
}

/** Which transaction body a packet carries; the field every reader narrows on. */
export type TransactionKind = 'useItem' | 'useItemOnEntity' | 'releaseItem';

/**
 * The fields every transaction body shares. The docs call them Action Type, Slot and Item.
 */
export interface TransactionData {
    kind: TransactionKind;
    actionType: number;
    hotbarSlot: number;
    itemInHand: Item;
}

/**
 * The docs' `ItemUseInventoryTransaction`: the item in hand used on a block or on nothing.
 *
 * Wire order is Action Type (varint), Trigger Type (uint8), Position (BlockPos), Face (uint8),
 * Slot (varint), Hand (uint8), Item, From Position (Vec3), Click Position (Vec3), Target Block
 * Id (varuint), Client Interact Prediction (uint8), Client Cooldown State (uint8).
 */
export interface UseItemData extends TransactionData {
    kind: 'useItem';
    /** The docs' Trigger Type: 1 for the player's own input, 2 for a held input replayed each tick. */
    triggerType: number;
    /** The docs' Position: the block that was clicked. */
    blockPosition: BlockPosition;
    /** The docs' Face. */
    blockFace: number;
    /** Which hand the item was in. Added at 2193. */
    hand: HandSlot;
    /** The docs' From Position: where the player stood when sending this. */
    playerPosition: Vector3;
    /** The docs' Click Position: where on the block face the click landed. */
    clickPosition: Vector3;
    /** The docs' Target Block Id: the runtime id of the clicked block's state. */
    blockRuntimeId: number;
    /** What the client has already drawn on its own screen, expecting the server to agree. */
    clientInteractPrediction: number;
    /** Whether the client thinks the item is on cooldown. */
    clientCooldownState: number;
}

/**
 * Reads the body of a use-item transaction: everything after the Actions.
 *
 * Shared with `PlayerAuthInputPacket`, which carries the same transaction inside itself when
 * the client used an item in the same tick it moved. The two packets differ only in what
 * surrounds this. Property order is read order, so these lines are the wire layout.
 */
export const readUseItemData = (stream: BinaryStream): UseItemData => ({
    kind: 'useItem',
    actionType: stream.readVarInt(),
    triggerType: stream.readByte(),
    blockPosition: NetworkUtil.readBlockPosition(stream),
    blockFace: stream.readByte(),
    hotbarSlot: stream.readVarInt(),
    hand: stream.readByte(),
    itemInHand: Item.networkDeserialize(stream),
    playerPosition: new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE()),
    clickPosition: new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE()),
    blockRuntimeId: stream.readUnsignedVarInt(),
    clientInteractPrediction: stream.readByte(),
    clientCooldownState: stream.readByte()
});

/**
 * The docs' `ItemUseOnActorInventoryTransaction`: the item in hand used on an entity.
 *
 * Wire order is Runtime Id (varuint64), Action Type (varint), Slot (varint), Item, From
 * Position (Vec3), Hit Position (Vec3).
 */
export interface UseItemOnEntityData extends TransactionData {
    kind: 'useItemOnEntity';
    /** The docs' Runtime Id: the entity that was clicked. */
    entityRuntimeId: bigint;
    /** The docs' From Position: where the player stood when sending this. */
    playerPosition: Vector3;
    /** The docs' Hit Position: where on the entity the click landed. */
    clickPosition: Vector3;
}

/**
 * The docs' `ItemReleaseInventoryTransaction`: a held item let go of, such as a bow firing.
 *
 * Wire order is Action Type (varint), Slot (varint), Item, From Position (Vec3).
 */
export interface ReleaseItemData extends TransactionData {
    kind: 'releaseItem';
    /** The docs' From Position: where the player stood when sending this. */
    playerPosition: Vector3;
}

/**
 * The docs' validity rule for a Legacy Request ID: negative and even. Zero means no request,
 * and the Legacy Set Item Slots list is only on the wire when the id is valid.
 */
const hasLegacyRequest = (legacyRequestId: number): boolean => legacyRequestId < -1 && (legacyRequestId & 1) === 0;

/**
 * Packet 30. The client's item use, attack, release or container move.
 *
 * Wire order at protocol 2193: Legacy Request ID (varint), Legacy Set Item Slots (presence
 * byte, then a varuint count and one {@link LegacySlotChange} each), the Transaction variant
 * index (varuint, {@link TransactionType}), Actions (varuint count and one
 * {@link InventoryAction} each), then the body the variant selects: {@link UseItemData},
 * {@link UseItemOnEntityData} or {@link ReleaseItemData}. Normal and Mismatch end after the
 * Actions.
 *
 * A 2193 client sends the three bodied types. Container moves, drops and creative picks go
 * through `ItemStackRequestPacket`, so a Normal transaction is a legacy client's and a
 * Mismatch is the client saying its inventory disagrees with the server's.
 */
export default class InventoryTransactionPacket extends DataPacket {
    public legacyRequestId!: number;
    public legacySlotChanges!: LegacySlotChange[];

    /**
     * The variant index as read. A value no {@link TransactionType} member has is kept so the
     * handler can say which type it dropped.
     */
    public transactionType!: TransactionType;
    public inventoryActions!: InventoryAction[];

    /** The body the type selects. Null for Normal, Mismatch and a type the reader does not know. */
    public transactionData: UseItemData | UseItemOnEntityData | ReleaseItemData | null = null;

    /**
     * Reads the packet in the order the class comment gives.
     *
     * Two things about the layout differ from protocol 748. The Legacy Set Item Slots have a
     * presence byte of their own, which the reader trusts over the request id. The presence
     * bytes that 1.26.30 put in front of the variant index and the Actions are gone again at
     * 2193 ("obsolete Cereal presence bytes", in Mojang's words). A reader still expecting
     * them takes the type for a flag and the flag for the type.
     *
     * A variant index this reader does not know has a body of unknown length, so reading
     * stops after the Actions and `transactionData` stays null. The handler drops the packet
     * at debug level; throwing here would log an error for every such packet instead.
     * @throws {RangeError} When the Actions list is longer than {@link MAX_INVENTORY_ACTIONS}.
     * @throws {Error} When a use-item body leaves bytes unread, which means the layout drifted.
     */
    public decodePayload(): void {
        this.legacyRequestId = this.readVarInt();
        this.legacySlotChanges = this.readBoolean()
            ? Array.from({ length: this.readUnsignedVarInt() }, () => LegacySlotChange.fromNetwork(this))
            : [];

        this.transactionType = this.readUnsignedVarInt();

        const actionsCount = this.readUnsignedVarInt();
        if (actionsCount > MAX_INVENTORY_ACTIONS) {
            throw new RangeError(
                `An inventory transaction carried ${actionsCount} actions; the docs allow ${MAX_INVENTORY_ACTIONS}`
            );
        }
        this.inventoryActions = Array.from({ length: actionsCount }, () => InventoryAction.fromNetwork(this));

        switch (this.transactionType) {
            case TransactionType.NORMAL:
            case TransactionType.MISMATCH:
                break;
            case TransactionType.USE_ITEM:
                this.transactionData = readUseItemData(this);

                // A layout that has drifted from the client's does not fail. It hands back
                // plausible looking values, and acting on those means destroying a block at a
                // position nobody touched. Leftover bytes mean the layout is wrong, and saying
                // so is worth more than the guess.
                if (!this.feof()) {
                    throw new Error(
                        `UseItem transaction left ${this.readRemaining().byteLength} bytes unread: the packet layout does not match the client's`
                    );
                }
                break;
            case TransactionType.USE_ITEM_ON_ENTITY:
                this.transactionData = {
                    kind: 'useItemOnEntity',
                    entityRuntimeId: this.readUnsignedVarLong(),
                    actionType: this.readVarInt(),
                    hotbarSlot: this.readVarInt(),
                    itemInHand: Item.networkDeserialize(this),
                    playerPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE()),
                    clickPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE())
                };
                break;
            case TransactionType.RELEASE_ITEM:
                this.transactionData = {
                    kind: 'releaseItem',
                    actionType: this.readVarInt(),
                    hotbarSlot: this.readVarInt(),
                    itemInHand: Item.networkDeserialize(this),
                    playerPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE())
                };
                break;
            default:
                // Nothing more can be read: the body's length depends on the type. See the
                // method comment for why this is not a throw.
                this.transactionData = null;
        }
    }

    /**
     * The mirror of {@link decodePayload}, so that a client such as the bot harness can send
     * what a real one sends, and so that a test can pin the two against each other.
     *
     * The Legacy Set Item Slots presence byte follows the request id, as the docs and the
     * client have it: a valid id always carries the list, even an empty one, and an invalid id
     * never does.
     * @throws {TypeError} When the type is not a {@link TransactionType} or the body does not match it.
     */
    public encodePayload(): void {
        this.writeVarInt(this.legacyRequestId);
        const hasLegacySlots = hasLegacyRequest(this.legacyRequestId);
        this.writeBoolean(hasLegacySlots);
        if (hasLegacySlots) {
            this.writeUnsignedVarInt(this.legacySlotChanges.length);
            for (const change of this.legacySlotChanges) change.toNetwork(this);
        }

        this.writeUnsignedVarInt(this.transactionType);

        this.writeUnsignedVarInt(this.inventoryActions.length);
        for (const action of this.inventoryActions) action.toNetwork(this);

        switch (this.transactionType) {
            case TransactionType.NORMAL:
            case TransactionType.MISMATCH:
                break;
            case TransactionType.USE_ITEM: {
                const data = this.transactionData;
                if (data?.kind !== 'useItem') throw new TypeError('A use-item transaction needs use-item data');
                writeUseItemData(this, data);
                break;
            }
            case TransactionType.USE_ITEM_ON_ENTITY: {
                const data = this.transactionData;
                if (data?.kind !== 'useItemOnEntity') {
                    throw new TypeError('A use-item-on-entity transaction needs use-item-on-entity data');
                }
                this.writeUnsignedVarLong(data.entityRuntimeId);
                this.writeVarInt(data.actionType);
                this.writeVarInt(data.hotbarSlot);
                data.itemInHand.networkSerialize(this);
                NetworkUtil.writeVector3(this, data.playerPosition);
                NetworkUtil.writeVector3(this, data.clickPosition);
                break;
            }
            case TransactionType.RELEASE_ITEM: {
                const data = this.transactionData;
                if (data?.kind !== 'releaseItem')
                    throw new TypeError('A release-item transaction needs release-item data');
                this.writeVarInt(data.actionType);
                this.writeVarInt(data.hotbarSlot);
                data.itemInHand.networkSerialize(this);
                NetworkUtil.writeVector3(this, data.playerPosition);
                break;
            }
            default:
                throw new TypeError(`Unknown transaction type ${this.transactionType}`);
        }
    }
}

/** The mirror of {@link readUseItemData}. */
export const writeUseItemData = (stream: BinaryStream, data: UseItemData): void => {
    stream.writeVarInt(data.actionType);
    stream.writeByte(data.triggerType);
    NetworkUtil.writeBlockPosition(stream, data.blockPosition);
    stream.writeByte(data.blockFace);
    stream.writeVarInt(data.hotbarSlot);
    stream.writeByte(data.hand);
    data.itemInHand.networkSerialize(stream);
    NetworkUtil.writeVector3(stream, data.playerPosition);
    NetworkUtil.writeVector3(stream, data.clickPosition);
    stream.writeUnsignedVarInt(data.blockRuntimeId);
    stream.writeByte(data.clientInteractPrediction);
    stream.writeByte(data.clientCooldownState);
};
