import ChangeSlot from '../type/ChangeSlot';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Item from '../../item/Item';
import NetworkTransaction from '../type/NetworkTransaction';
import Vector3 from '../../math/Vector3';

export enum InventoryTransactionUseItemActionType {
    ClickBlock = 0,
    ClickAir = 1,
    BreakBlock = 2
}

export enum InventoryTransactionType {
    Normal = 0,
    Mismatch = 1,
    UseItem = 2,
    UseItemOnEntity = 3,
    ReleaseItem = 4
}

export default class InventoryTransactionPacket extends DataPacket {
    public static NetID = Identifiers.InventoryTransactionPacket;

    public type!: InventoryTransactionType;
    public actions = new Map();
    public actionType!: number;
    public hotbarSlot!: number;
    public itemInHand!: Item;

    public blockPosition: Vector3 = new Vector3();
    public face!: number;
    public playerPosition: Vector3 = new Vector3();
    public clickPosition: Vector3 = new Vector3();
    public blockRuntimeId!: number;
    public entityId = BigInt(0);
    public requestId!: number;
    public changeSlot = new Map();
    public hasItemStackIds!: boolean;

    public decodePayload() {
        this.requestId = this.readVarInt();
        if (this.requestId !== 0) {
            const length = this.readUnsignedVarInt();
            for (let i = 0; i < length; i++) {
                this.changeSlot.set(i, new ChangeSlot().decode(this));
            }
        }

        this.type = this.readUnsignedVarInt();
        this.hasItemStackIds = this.readBool();

        const actionsCount = this.readUnsignedVarInt();
        for (let i = 0; i < actionsCount; i++) {
            const networkTransaction = new NetworkTransaction().decode(this, this.hasItemStackIds);
            this.actions.set(i, networkTransaction);
        }

        switch (this.type) {
            case InventoryTransactionType.Normal:
            case InventoryTransactionType.Mismatch:
                break;
            case InventoryTransactionType.UseItem:
                this.actionType = this.readUnsignedVarInt();
                this.blockPosition = new Vector3(this.readVarInt(), this.readUnsignedVarInt(), this.readVarInt());
                this.face = this.readVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = Item.networkDeserialize(this);
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.clickPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.blockRuntimeId = this.readUnsignedVarInt();
                break;
            case InventoryTransactionType.UseItemOnEntity:
                this.entityId = this.readUnsignedVarLong();
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = Item.networkDeserialize(this);
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.clickPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                break;
            case InventoryTransactionType.ReleaseItem:
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = Item.networkDeserialize(this);
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                break;
            default:
                break;
        }
    }
}
