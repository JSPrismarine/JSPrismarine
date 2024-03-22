import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Item from '../../item/Item';
import Vector3 from '../../math/Vector3';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import BlockPosition from '../../world/BlockPosition';

export enum UseItemAction {
    CLICK_BLOCK,
    CLICK_AIR,
    BREAK_BLOCK
}

export enum TransactionType {
    NORMAL,
    MISMATCH,
    USE_ITEM,
    USE_ITEM_ON_ENTITY,
    RELASE_ITEM
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

    public static fromNetwork(stream: BinaryStream): InventoryAction {
        const sourceType = stream.readUnsignedVarInt();
        const windowId =
            sourceType === ActionSource.CONTAINER || sourceType === ActionSource.NON_IMPLEMENTED_TODO
                ? stream.readVarInt()
                : null;
        const sourceFlags = sourceType === ActionSource.WORLD ? stream.readUnsignedVarInt() : null;
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
        [ActionSource.CONTAINER, ActionSource.NON_IMPLEMENTED_TODO].includes(this.sourceType) &&
            stream.writeVarInt(this.windowId!);
        this.sourceType === ActionSource.WORLD && stream.writeUnsignedVarInt(this.sourceFlags!);
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
    blockPosition: BlockPosition;
    blockFace: number;
    playerPosition: Vector3;
    clickPosition: Vector3;
    blockRuntimeId: number;
}

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

    public decodePayload() {
        this.legacyRequestId = this.readVarInt();
        if (this.legacyRequestId !== 0) {
            const slotChanges = this.readUnsignedVarInt();
            this.legacySlotChanges = Array.from({ length: slotChanges }, () => LegacySlotChange.fromNetwork(this));
        }

        this.transactionType = this.readUnsignedVarInt();

        const actionsCount = this.readUnsignedVarInt();
        this.inventoryActions = Array.from({ length: actionsCount }, () => InventoryAction.fromNetwork(this));

        switch (this.transactionType) {
            case TransactionType.NORMAL:
            case TransactionType.MISMATCH:
                break;
            case TransactionType.USE_ITEM:
                this.transactionData = <UseItemData>{
                    actionType: this.readUnsignedVarInt(),
                    blockPosition: BlockPosition.networkDeserialize(this),
                    blockFace: this.readVarInt(),
                    hotbarSlot: this.readVarInt(),
                    itemInHand: Item.networkDeserialize(this),
                    playerPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE()),
                    clickPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE()),
                    blockRuntimeId: this.readUnsignedVarInt()
                };
                break;
            case TransactionType.USE_ITEM_ON_ENTITY:
                this.transactionData = <UseItemOnEntityData>{
                    entityRuntimeId: this.readUnsignedVarLong(),
                    actionType: this.readUnsignedVarInt(),
                    hotbarSlot: this.readVarInt(),
                    itemInHand: Item.networkDeserialize(this),
                    playerPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE()),
                    clickPosition: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE())
                };
                break;
            case TransactionType.RELASE_ITEM:
                this.transactionData = <RelaseItemData>{
                    actionType: this.readUnsignedVarInt(),
                    hotbarSlot: this.readVarInt(),
                    itemInHand: Item.networkDeserialize(this),
                    headRotation: new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE())
                };
                break;
            default:
                throw new TypeError(`Unknown transaction type ${this.transactionType}`);
        }
    }
}
