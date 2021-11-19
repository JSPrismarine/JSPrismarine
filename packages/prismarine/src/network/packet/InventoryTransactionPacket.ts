import ChangeSlot from '../type/ChangeSlot';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Item from '../../item/Item';
import NetworkTransaction from '../type/NetworkTransaction';
import Vector3 from '../../math/Vector3';

export enum InventoryTransactionUseItemAction {
    CLICK_BLOCK,
    CLICK_AIR,
    BREAK_BLOCK
}

export enum InventoryTransaction {
    NORMAL,
    MISMATCH,
    USE_ITEM,
    USE_ITEM_ON_ENTITY,
    RELASE_ITEM
}

export default class InventoryTransactionPacket extends DataPacket {
    public static NetID = Identifiers.InventoryTransactionPacket;

    public transactionType!: InventoryTransaction;
    public actions!: Array<NetworkTransaction>;
    public actionType!: number;
    public hotbarSlot!: number;
    public itemInHand!: Item;

    public blockPosition: Vector3 = new Vector3();
    public face!: number;
    public playerPosition: Vector3 = new Vector3();
    public clickPosition: Vector3 = new Vector3();
    public blockRuntimeId!: number;
    public entityId = BigInt(0);
    public legacyRequestId!: number;
    public changeSlot = new Map();
    public hasItemStackIds!: boolean;

    public decodePayload() {
        this.legacyRequestId = this.readVarInt();
        if (this.legacyRequestId < -1 && (this.legacyRequestId & 1) == 0) {
            const length = this.readUnsignedVarInt();
            for (let i = 0; i < length; i++) {
                this.changeSlot.set(i, new ChangeSlot().decode(this));
            }
        }

        this.transactionType = this.readUnsignedVarInt();

        const length = this.readUnsignedVarInt();
        const actions = new Array<NetworkTransaction>();
        for (let i = 0; i < length; i++) {
            // TODO: McpeUtil.readNetworkTransaction()
            actions.push(new NetworkTransaction().decode(this, false));
        }

        switch (this.transactionType) {
            case InventoryTransaction.NORMAL:
            case InventoryTransaction.MISMATCH:
                break;
            case InventoryTransaction.USE_ITEM:
                this.actionType = this.readUnsignedVarInt();
                this.blockPosition = new Vector3(this.readVarInt(), this.readUnsignedVarInt(), this.readVarInt());
                this.face = this.readVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = Item.networkDeserialize(this);
                this.playerPosition = new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE());
                this.clickPosition = new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE());
                this.blockRuntimeId = this.readUnsignedVarInt();
                break;
            case InventoryTransaction.USE_ITEM_ON_ENTITY:
                this.entityId = this.readUnsignedVarLong();
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = Item.networkDeserialize(this);
                this.playerPosition = new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE());
                this.clickPosition = new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE());
                break;
            case InventoryTransaction.RELASE_ITEM:
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = Item.networkDeserialize(this);
                this.playerPosition = new Vector3(this.readFloatLE(), this.readFloatLE(), this.readFloatLE());
                break;
            default:
                throw new Error(`Unknown inventory transaction type=${this.transactionType}`);
        }
    }
}
