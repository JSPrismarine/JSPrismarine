import type BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { Item } from '../../item/Item';
import type BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

export enum UseItemAction {
    CLICK_BLOCK,
    CLICK_AIR,
    BREAK_BLOCK
}

/**
 * What a client meant by clicking on an entity.
 *
 * A melee attack arrives here rather than in `InteractPacket`, which is not what its name
 * suggests: that one carries mounting, dismounting and opening a villager's trades. Everything
 * that comes out of swinging at something comes through this transaction.
 */
export enum UseItemOnEntityAction {
    /** Right-clicked it: shearing, saddling, trading, leading. */
    INTERACT,
    /** Hit it. */
    ATTACK,
    /** Used the held item on it specifically, rather than interacting with the entity itself. */
    ITEM_INTERACT
}

export enum TransactionType {
    NORMAL,
    MISMATCH,
    USE_ITEM,
    USE_ITEM_ON_ENTITY,
    RELASE_ITEM
}

/** Which hand an item was used from. */
export enum HandSlot {
    MAINHAND,
    OFFHAND
}

export class LegacySlotChange {
    public constructor(
        public containerId: number,
        public slots: number[]
    ) {}

    public static fromNetwork(stream: BinaryStream): LegacySlotChange {
        const containerId = stream.readByte();
        const slotCount = stream.readUnsignedVarInt();
        const slots = Array.from(stream.read(slotCount));
        return new LegacySlotChange(containerId, slots);
    }

    public toNetwork(stream: BinaryStream): void {
        stream.writeByte(this.containerId);
        stream.writeUnsignedVarInt(this.slots.length);
        stream.write(Buffer.from(this.slots));
    }
}

export enum ActionSource {
    INVALID = -1,
    CONTAINER,
    GLOBAL,
    WORLD,
    CREATIVE,
    UNTRACKED_INTERACTION_UI = 100,
    NON_IMPLEMENTED_TODO = 99999
}

export class InventoryAction {
    public constructor(
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
     * The window id and the flags are each an optional with its own presence byte - not, as
     * they were up to 748, fields whose presence the reader inferred from the source type.
     * The client sets the byte by the same rule the reader used to apply (a container has a
     * window, the world has flags), but the byte is what is on the wire, and a reader that
     * infers instead of reading is a field out the moment the two disagree. The window id is
     * a single signed byte now, where it used to be a varint.
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

export interface TransactionData {
    actionType: number;
    hotbarSlot: number;
    itemInHand: Item;
}

export interface UseItemData extends TransactionData {
    /** What set the use off - a tap, a hold, the item being equipped. */
    triggerType: number;
    blockPosition: BlockPosition;
    blockFace: number;
    /** Which hand the item was in. Added at 2193. */
    hand: HandSlot;
    playerPosition: Vector3;
    clickPosition: Vector3;
    blockRuntimeId: number;
    /** What the client has already drawn on its own screen, expecting the server to agree. */
    clientInteractPrediction: number;
    /** Whether the client thinks the item is on cooldown. */
    clientCooldownState: number;
}

/**
 * Reads the body of a use-item transaction: everything after the actions.
 *
 * Shared with `PlayerAuthInputPacket`, which carries the same transaction inside itself when
 * the client used an item in the same tick it moved - the two packets differ only in what
 * surrounds this. Property order is read order, so these lines are the wire layout.
 */
export const readUseItemData = (stream: BinaryStream): UseItemData => ({
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

export interface UseItemOnEntityData extends TransactionData {
    entityRuntimeId: bigint;
    playerPosition: Vector3;
    clickPosition: Vector3;
}

export interface RelaseItemData extends TransactionData {
    headRotation: Vector3;
}

export default class InventoryTransactionPacket extends DataPacket {
    public static NetID = Identifiers.InventoryTransactionPacket;

    public legacyRequestId!: number;
    public legacySlotChanges!: LegacySlotChange[];

    public transactionType!: TransactionType;
    public inventoryActions!: InventoryAction[];

    public transactionData!: TransactionData;

    /**
     * The layout is protocol 2193's. Two things about it are not what they were at 748:
     *
     * - The legacy slot changes are an optional with a presence byte, not a list whose
     *   presence follows from the request id.
     * - The presence bytes that 1.26.30 put in front of the transaction type and the action
     *   list are gone again at 2193 ("obsolete Cereal presence bytes", Mojang's words). A
     *   reader still expecting them takes the type for a flag and the flag for the type.
     */
    public decodePayload(): void {
        this.legacyRequestId = this.readVarInt();
        this.legacySlotChanges = this.readBoolean()
            ? Array.from({ length: this.readUnsignedVarInt() }, () => LegacySlotChange.fromNetwork(this))
            : [];

        this.transactionType = this.readUnsignedVarInt();

        const actionsCount = this.readUnsignedVarInt();
        this.inventoryActions = Array.from({ length: actionsCount }, () => InventoryAction.fromNetwork(this));

        switch (this.transactionType) {
            case TransactionType.NORMAL:
            case TransactionType.MISMATCH:
                break;
            case TransactionType.USE_ITEM:
                this.transactionData = readUseItemData(this);

                // A layout that has drifted from the client's does not fail - it hands back
                // plausible looking rubbish, and acting on that means destroying a block at a
                // position nobody touched. Leftover bytes mean the layout is wrong, and
                // saying so is worth more than the guess.
                if (!this.feof()) {
                    throw new Error(
                        `UseItem transaction left ${this.readRemaining().byteLength} bytes unread: the packet layout does not match the client's`
                    );
                }
                break;
            case TransactionType.USE_ITEM_ON_ENTITY:
                this.transactionData = <UseItemOnEntityData>{
                    entityRuntimeId: this.readUnsignedVarLong(),
                    actionType: this.readVarInt(),
                    hotbarSlot: this.readVarInt(),
                    itemInHand: Item.networkDeserialize(this),
                    playerPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE()),
                    clickPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE())
                };
                break;
            case TransactionType.RELASE_ITEM:
                this.transactionData = <RelaseItemData>{
                    actionType: this.readVarInt(),
                    hotbarSlot: this.readVarInt(),
                    itemInHand: Item.networkDeserialize(this),
                    headRotation: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE())
                };
                break;
            default:
                throw new TypeError(`Unknown transaction type ${this.transactionType}`);
        }
    }

    /**
     * The mirror of {@link decodePayload}, so that a client - the bot harness - can send what
     * a real one sends, and so that a test can pin the two against each other.
     */
    public encodePayload(): void {
        this.writeVarInt(this.legacyRequestId);
        this.writeBoolean(this.legacySlotChanges.length > 0);
        if (this.legacySlotChanges.length > 0) {
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
            case TransactionType.USE_ITEM:
                writeUseItemData(this, this.transactionData as UseItemData);
                break;
            case TransactionType.USE_ITEM_ON_ENTITY: {
                const data = this.transactionData as UseItemOnEntityData;
                this.writeUnsignedVarLong(data.entityRuntimeId);
                this.writeVarInt(data.actionType);
                this.writeVarInt(data.hotbarSlot);
                data.itemInHand.networkSerialize(this);
                NetworkUtil.writeVector3(this, data.playerPosition);
                NetworkUtil.writeVector3(this, data.clickPosition);
                break;
            }
            case TransactionType.RELASE_ITEM: {
                const data = this.transactionData as RelaseItemData;
                this.writeVarInt(data.actionType);
                this.writeVarInt(data.hotbarSlot);
                data.itemInHand.networkSerialize(this);
                NetworkUtil.writeVector3(this, data.headRotation);
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
