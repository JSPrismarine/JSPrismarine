<<<<<<< HEAD:src/network/packet/inventory-transaction.js
const DataPacket = require('./packet').default;
const Identifiers = require('../Identifiers').default;
const logger = require('../../utils/Logger');
const ChangeSlot = require('../type/ChangeSlot').default;
=======
import Block from "../../block";
import Item from "../../item";
import Vector3 from "../../math/Vector3";
import type Prismarine from "../../Prismarine";
import Identifiers from "../Identifiers";
import DataPacket from "./Packet";

const ChangeSlot = require('../type/change-slot');
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet/InventoryTransactionPacket.ts
const NetworkTransaction = require('../type/network-transaction');
const InventoryTransactionType = require('../type/inventory-transaction-type');

export enum InventoryTransactionActionType {
    Build = 1,
    Break = 2
};

export default class InventoryTransactionPacket extends DataPacket {
    static NetID = Identifiers.InventoryTransactionPacket

    type = 0;
    actions = new Map();
    actionType = 0;
    hotbarSlot = 0;
    itemInHand: Block | Item | null = null
    blockX = 0;
    blockY = 0;
    blockZ = 0;
    face = 0;
    playerPosition = new Vector3();
    clickPosition = new Vector3();
    blockRuntimeId = 0;
    entityId = BigInt(0);

    // 1.16

    requestId = 0;
    changeSlot = new Map()
    hasItemStackIds: boolean = false;

    decodePayload(server: Prismarine) {
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
            let networkTransaction = new NetworkTransaction(server).decode(this, this.hasItemStackIds);
            this.actions.set(i, networkTransaction);
        }

        switch (this.type) {
            case InventoryTransactionType.Normal:
            case InventoryTransactionType.Mismatch:
                break;
            case InventoryTransactionType.UseItem:
                this.actionType = this.readUnsignedVarInt();
                this.blockX = this.readVarInt();
                this.blockY = this.readUnsignedVarInt();
                this.blockZ = this.readVarInt();
                this.face = this.readVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.clickPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.blockRuntimeId = this.readUnsignedVarInt();
                break;
            case InventoryTransactionType.UseItemOnEntity:
                this.entityId = this.readUnsignedVarLong();
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.clickPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                break;
            case InventoryTransactionType.ReleaseItem:
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                break;
            default:
                server.getLogger().warn(`Unknown transaction type ${this.type}`);
        }
    }
};
