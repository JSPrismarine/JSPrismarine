import Vector3 from '../../math/Vector3';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

const ChangeSlot = require('../type/change-slot');
const NetworkTransaction = require('../type/network-transaction');
const InventoryTransactionType = require('../type/inventory-transaction-type');

export enum InventoryTransactionActionType {
    Build = 1,
    Break = 2
}

export default class InventoryTransactionPacket extends DataPacket {
    static NetID = Identifiers.InventoryTransactionPacket;

    public type: number = 0;
    public actions = new Map();
    public actionType: number = 0;
    public hotbarSlot: number = 0;
    public itemInHand = {
        id: 0,
        meta: 0
    };
    public blockPosition: Vector3 = new Vector3();
    public face: number = 0;
    public playerPosition: Vector3 = new Vector3();
    public clickPosition: Vector3 = new Vector3();
    public blockRuntimeId = 0;
    public entityId = BigInt(0);
    public requestId: number = 0;
    public changeSlot = new Map();
    public hasItemStackIds: boolean = false;

    public decodePayload() {
        this.requestId = this.readVarInt();
        if (this.requestId != 0) {
            let length = this.readUnsignedVarInt();
            for (let i = 0; i < length; i++) {
                this.changeSlot.set(i, new ChangeSlot().decode(this));
            }
        }

        this.type = this.readUnsignedVarInt();
        this.hasItemStackIds = this.readBool();

        let actionsCount = this.readUnsignedVarInt();
        for (let i = 0; i < actionsCount; i++) {
            let networkTransaction = new NetworkTransaction().decode(
                this,
                this.hasItemStackIds
            );
            this.actions.set(i, networkTransaction);
        }

        switch (this.type) {
            case InventoryTransactionType.Normal:
            case InventoryTransactionType.Mismatch:
                break;
            case InventoryTransactionType.UseItem:
                this.actionType = this.readUnsignedVarInt();
                this.blockPosition = new Vector3(
                    this.readVarInt(),
                    this.readUnsignedVarInt(),
                    this.readVarInt()
                );
                this.face = this.readVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(
                    this.readLFloat(),
                    this.readLFloat(),
                    this.readLFloat()
                );
                this.clickPosition = new Vector3(
                    this.readLFloat(),
                    this.readLFloat(),
                    this.readLFloat()
                );
                this.blockRuntimeId = this.readUnsignedVarInt();
                break;
            case InventoryTransactionType.UseItemOnEntity:
                this.entityId = this.readUnsignedVarLong();
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(
                    this.readLFloat(),
                    this.readLFloat(),
                    this.readLFloat()
                );
                this.clickPosition = new Vector3(
                    this.readLFloat(),
                    this.readLFloat(),
                    this.readLFloat()
                );
                break;
            case InventoryTransactionType.ReleaseItem:
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(
                    this.readLFloat(),
                    this.readLFloat(),
                    this.readLFloat()
                );
                break;
            default:
                this.getServer()
                    .getLogger()
                    .warn(`Unknown transaction type ${this.type}`);
        }
    }
}
