<<<<<<< HEAD:src/network/PacketBinaryStream.ts
import type Prismarine from "../Prismarine";
import BinaryStream from '@jsprismarine/jsbinaryutils';
import UUID from '../utils/UUID';
import Skin from '../utils/skin/Skin';
import { FlagType } from '../entity/metadata';
import CommandOriginData from './type/CommandOriginData';
import CommandOrigin from './type/CommandOrigin';
import SkinImage from '../utils/skin/SkinImage';
import type PlayerListEntry from './type/PlayerListEntry';
import type CreativeContentEntry from './type/CreativeContentEntry';
import SkinAnimation from '../utils/skin/SkinAnimation';
import SkinCape from '../utils/skin/SkinCape';
import SkinPersonaPiece from '../utils/skin/skin-persona/PersonaPiece';
import SkinPersona from '../utils/skin/skin-persona/Persona';
import SkinPersonaPieceTintColor from '../utils/skin/skin-persona/PieceTintColor';
import type Block from "../block";
import Item from "../item";
import Logger from '../utils/Logger';

import ItemStackRequest from './type/item-stack-requests/item-stack-request';
import ItemStackRequestTake from './type/item-stack-requests/take';
import ItemStackRequestPlace from './type/item-stack-requests/place';
import ItemStackRequestDrop from './type/item-stack-requests/drop';
import ItemStackRequestSwap from './type/item-stack-requests/swap';
import ItemStackRequestDestroy from './type/item-stack-requests/destroy';
import ItemStackRequestCreativeCreate from './type/item-stack-requests/creative-create';
import ItemStackRequestConsume from './type/item-stack-requests/consume';
import { triggerAsyncId } from 'async_hooks';
import type EntityAttribute from "./type/EntityAttribute";

const NBT = require('@jsprismarine/nbt');
const NetworkLittleEndianBinaryStream = require('@jsprismarine/nbt/streams/network-le-binary-stream');
const CompoundTag = require('@jsprismarine/nbt/tags/compound-tag');

class PacketBinaryStream extends BinaryStream {
    #server: Prismarine;

    public constructor(server: Prismarine) {
=======
import BinaryStream from '@jsprismarine/jsbinaryutils';
import NBT from '../nbt/NBT';
import NetworkLittleEndianBinaryStream from '../nbt/streams/NetworkLittleEndianBinaryStream';
import CompoundTag from '../nbt/tags/CompoundTag';
import type Prismarine from '../Prismarine';
import Skin from '../utils/skin/skin';
import SkinImage from '../utils/skin/skin-image';
import CreativeContentEntry from './type/creative-content-entry';
import PlayerListEntry from './type/player-list-entry';

const UUID = require('../utils/uuid');
const { FlagType } = require('../entity/metadata');
const CommandOriginData = require('./type/command-origin-data');
const CommandOrigin = require('./type/command-origin');
const SkinAnimation = require('../utils/skin/skin-animation');
const SkinCape = require('../utils/skin/skin-cape');
const SkinPersonaPiece = require('../utils/skin/skin-persona/persona-piece');
const SkinPersona = require('../utils/skin/skin-persona/persona');
const SkinPersonaPieceTintColor = require('../utils/skin/skin-persona/piece-tint-color');
const Item = require('../item').default;
const Block = require('../block').default;

const ItemStackRequest = require('./type/item-stack-requests/item-stack-request');
const ItemStackRequestTake = require('./type/item-stack-requests/take');
const ItemStackRequestPlace = require('./type/item-stack-requests/place');
const ItemStackRequestDrop = require('./type/item-stack-requests/drop');
const ItemStackRequestSwap = require('./type/item-stack-requests/swap');
const ItemStackRequestDestroy = require('./type/item-stack-requests/destroy');
const ItemStackRequestCreativeCreate = require('./type/item-stack-requests/creative-create');
const ItemStackRequestConsume = require('./type/item-stack-requests/consume');

export default class PacketBinaryStream extends BinaryStream {
    #server: Prismarine;

    constructor(server: Prismarine) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        super();
        this.#server = server;
    }

<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public getServer(): Prismarine {
=======
    getServer(): Prismarine {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        return this.#server;
    }

    /**
     * Returns a string encoded into the buffer.
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public readString(): string {
=======
    readString(): string {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        return this.read(this.readUnsignedVarInt()).toString();
    }

    /**
     * Encodes a string into the buffer.
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public writeString(v: string): void {
=======
    writeString(v: string) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeUnsignedVarInt(Buffer.byteLength(v));
        this.append(Buffer.from(v, 'utf8'));
    }

    /**
     * Returns a buffer.
     */
    public readBuffer(): Buffer {
     return this.read(this.readUnsignedVarInt());
    }

    /**
    * Encodes a string into the buffer.
    */
    public writeBuffer(v: Buffer): void {
        this.writeUnsignedVarInt(Buffer.byteLength(v));
        this.append(v);
    }

    public readUUID(): UUID {
        let part1 = this.readLInt();
        let part0 = this.readLInt();
        let part3 = this.readLInt();
        let part2 = this.readLInt();

        return new UUID(part0, part1, part2, part3);
    }

    /**
     * Encodes an UUID into the buffer.
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public writeUUID(uuid: UUID): void {
=======
    writeUUID(uuid: any) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeLInt(uuid.parts[1]);
        this.writeLInt(uuid.parts[0]);
        this.writeLInt(uuid.parts[3]);
        this.writeLInt(uuid.parts[2]);
    }

    /**
     * Retrurns a skin encoded into the buffer.
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public readSkin(): Skin {
=======
    readSkin(): Skin {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        let skin = new Skin();
        skin.id = this.readString();
        skin.resourcePatch = this.readString();

        // Read skin image
        skin.image = new SkinImage({
            width: this.readLInt(),
            height: this.readLInt(),
            data: this.readString()
        });


        // Read animations
        let animationCount = this.readLInt();
        for (let i = 0; i < animationCount; i++) {
            skin.animations.add(new SkinAnimation({
                image: new SkinImage({
                    width: this.readLInt(),
                    height: this.readLInt(),
                    data: this.readString()
                }),
                frames: this.readLFloat(),
                type: this.readLInt()
            }));
        }

        // Read cape image 
        skin.cape = new SkinCape();
        skin.cape.image = new SkinImage({
            width: this.readLInt(),
            height: this.readLInt(),
            data: this.readBuffer()
        });

        // Miscellaneus
        skin.geometry = this.readString();
        skin.animationData = this.readString();
        skin.isPersona = this.readBool();
        skin.isPersona = this.readBool();
        skin.isCapeOnClassicSkin = this.readBool();
        skin.cape.id = this.readString();
        skin.fullId = this.readString();
        skin.armSize = this.readString();
        skin.color = this.readString();

        // Avoid reading useless data
        if (skin.isPersona) {
            skin.persona = new SkinPersona();

            // Read persona pieces
            let personaPieceCount = this.readLInt();
            for (let i = 0; i < personaPieceCount; i++) {
                skin.persona.pieces.add(new SkinPersonaPiece({
                    pieceId: this.readString(),
                    pieceType: this.readString(),
                    packId: this.readString(),
                    isDefault: this.readBool(),
                    productId: this.readString()
                }));
            }

            // Read piece tint colors
            let pieceTintColors = this.readLInt();
            for (let i = 0; i < pieceTintColors; i++) {
                let pieceTintColor = new SkinPersonaPieceTintColor();
                pieceTintColor.pieceType = this.readString();
                let colorsCount = this.readLInt();
                for (let c = 0; c < colorsCount; c++) {
                    pieceTintColor.colors.push(this.readString());
                }
                skin.persona.tintColors.add(pieceTintColor);
            }
        }

        return skin;
    }

    /**
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
     * Encodes a skin into the buffer.
     */
    public writeSkin(skin: Skin): void {
=======
     * Encodes a skin into the buffer
     */
    writeSkin(skin: Skin) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeString(skin.id);
        this.writeString(skin.resourcePatch);

        // Skin image
        this.writeSkinImage(skin.image);

        // Animations
        this.writeLInt(skin.animations.size);
        for (let animation of skin.animations) {
            this.writeSkinImage(animation.image);
            this.writeLInt(animation.type);
            this.writeLFloat(animation.frames);
        }

        // Cape image
        this.writeSkinImage(skin.cape.image);

        // Miscellaneus
        this.writeString(skin.geometry);
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
        this.writeString(skin.animationData as string);
        this.writeBool(skin.isPremium);
        this.writeBool(skin.isPersona);
        this.writeBool(skin.isCapeOnClassicSkin);
=======
        this.writeString(skin.animationData);
        this.writeBool(skin.isPremium as unknown as number);
        this.writeBool(skin.isPersona as unknown as number);
        this.writeBool(skin.isCapeOnClassicSkin as unknown as number);
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeString(skin.cape.id);
        this.writeString(skin.fullId);
        this.writeString(skin.armSize);
        this.writeString(skin.color);

        // Hack to keep less useless data in software 
        if (skin.isPersona) {
            this.writeLInt(skin.persona.pieces.size);
            for (let personaPiece of skin.persona.pieces) {
                this.writeString(personaPiece.pieceId);
                this.writeString(personaPiece.pieceType);
                this.writeString(personaPiece.packId);
                this.writeBool(personaPiece.isDefault as unknown as number);
                this.writeString(personaPiece.productId);
            }
            this.writeLInt(skin.persona.tintColors.size);
            for (let tint of skin.persona.tintColors) {
                this.writeString(tint.pieceType);
                this.writeLInt(tint.colors.length);
                for (let color of tint.colors) {
                    this.writeString(color);
                }
            }
        } else {
            this.writeLInt(0);  // Persona pieces
            this.writeLInt(0);  // Tint colors
        }
    }

    /**
     * Encodes a skin image into the buffer.
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public writeSkinImage(image: SkinImage): void {
=======
    private writeSkinImage(image: SkinImage) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeLInt(image.width);
        this.writeLInt(image.height);
        this.writeBuffer(image.data as Buffer);
    }

    /**
     * Encodes a player list entry into the buffer.
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public writePlayerListAddEntry(entry: PlayerListEntry): void {
=======
    writePlayerListAddEntry(entry: PlayerListEntry) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeUUID(entry.uuid);
        this.writeVarLong(BigInt(entry.uniqueEntityId));
        this.writeString(entry.name);
        this.writeString(entry.xuid);
        this.writeString(entry.platformChatId);
        this.writeLInt(entry.buildPlatform);
        this.writeSkin(entry.skin);
        this.writeBool(entry.isTeacher as unknown as number);
        this.writeBool(entry.isHost as unknown as number);
    }

    /**
     * Removes a player list entry by UUID.
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public writePlayerListRemoveEntry(entry: PlayerListEntry): void {
        this.writeUUID(entry.uuid);
    }

    public writeAttributes(attributes: EntityAttribute[]): void {
=======
    writePlayerListRemoveEntry(entry: PlayerListEntry) {
        this.writeUUID(entry.uuid);
    }

    writeAttributes(attributes: any) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeUnsignedVarInt(attributes.length);
        for (let attribute of attributes) {
            this.writeLFloat(attribute.min);
            this.writeLFloat(attribute.max);
            this.writeLFloat(attribute.value);
            this.writeLFloat(attribute.default);
            this.writeString(attribute.name);
        }
    }
<<<<<<< HEAD:src/network/PacketBinaryStream.ts

    public writeCreativeContentEntry(entry: CreativeContentEntry): void {
=======
    writeCreativeContentEntry(entry: CreativeContentEntry) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeVarInt(entry.entryId);
        this.writeItemStack(entry.item);
    }

    /**
     * Serializes gamerules into the buffer.
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public writeGamerules(rules: Map<string, boolean|number>): void {
=======
    writeGamerules(rules: any) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeUnsignedVarInt(rules.size);
        for (let [name, value] of rules) {
            this.writeString(name);
            switch (typeof value) {
                case 'boolean':
                    this.writeByte(1);  // maybe value type ??     
                    this.writeBool(value as unknown as number);
                    break;
                case 'number':
                    if (this.isInt(value)) {
                        this.writeByte(2);  // maybe value type ??  
                        this.writeUnsignedVarInt(value);
                    } else if (this.isFloat(value)) {
                        this.writeByte(3);  // maybe value type ??  
                        this.writeLFloat(value);
                    }
                    break;
                default:
                    this.#server.getLogger().error(`Unknown Gamerule type ${value}`);
            }
        }
    }

<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public writeEntityMetadata(metadata: Map<number, Array<number|string>>) {
=======
    private isInt(n: number) {
        return n % 1 === 0;
    }
    private isFloat(n: number) {
        return n % 1 !== 0;
    }

    writeEntityMetadata(metadata: any) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        this.writeUnsignedVarInt(metadata.size);
        for (const [index, value] of metadata) {
            this.writeUnsignedVarInt(index);
            this.writeUnsignedVarInt(value[0] as number);
            switch (value[0]) {
                case FlagType.Byte:
                    this.writeByte(value[1] as number);
                    break;
                case FlagType.Float:
                    this.writeLFloat(value[1] as number);
                    break;
                case FlagType.Long:
                    this.writeVarLong(BigInt(value[1] as number));
                    break;
                case FlagType.String:
                    this.writeString(value[1] as string);
                    break;
                case FlagType.Short:
                    this.writeLShort(value[1] as number);
                    break;
                default:
                    this.#server.getLogger().warn(`Unknown meta type ${value}`);
            }
        }
    }

    public readItemStack(): any {
        let id = this.readVarInt();
        if (id == 0) {
            // TODO: items
            return { id: 0, data: 0, amount: 0 };
        }

        let name = null;
        let temp = this.readVarInt();
        let amount = (temp & 0xff);
        let meta = (temp >> 8);

        let extraLen = this.readLShort();
        let nbt = null;
        if (extraLen == 0xffff) {
            this.readByte();  // ? nbt version
            // As i cannot pass offset by reference, i keep it using this binary stream directly
            let stream = new NetworkLittleEndianBinaryStream(this.getBuffer(), this.getOffset());
            let decodedNBT = (new NBT()).readTag(stream, true, true);
            if (!(decodedNBT instanceof CompoundTag)) {
                throw new Error('Invalid NBT root tag for itemstack');
            }
            nbt = decodedNBT;
            (this as any).offset = stream.getOffset();
        } else if (extraLen !== 0) {
            throw new Error(`Invalid NBT itemstack length ${extraLen}`);
        }

        let countPlaceOn = this.readVarInt();
        for (let i = 0; i < countPlaceOn; i++) {
            this.readString();
        }

        let countCanBreak = this.readVarInt();
        for (let i = 0; i < countCanBreak; i++) {
            this.readString();
        }

        // TODO: check if has other tags
        /* if (nbt !== null) {
            if (nbt.hasTag('Damage', IntTag)) {

            }
        } */

        let item: Item = new Item({ name: name || 'air', id: id });
        item.meta = meta;
        item.count = amount;
        item.nbt = nbt;
        return item;
    }

    /**
     * Serializes an item into the buffer.
     * 
     * @param {Item | Block} itemstack 
     */
<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    public writeItemStack(itemstack: Item|Block) {
=======
    writeItemStack(itemstack: any) {
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
        if (itemstack.name === 'minecraft:air') {
            return this.writeVarInt(0);
        }

        this.writeVarInt(itemstack.getRuntimeId());
        this.writeVarInt(((itemstack.meta & 0x7fff) << 8) | itemstack.count);

        if (itemstack.nbt !== null) {
            // write the amount of tags to write
            // (1) according to vanilla
            this.writeLShort(0xffff);
            this.writeByte(1);

            // write hardcoded NBT tag
            // TODO: unimplemented NBT.write(nbt, true, true)
        } else {
            this.writeLShort(0);
        }

        // canPlace and canBreak
        this.writeVarInt(0);
        this.writeVarInt(0);

        // TODO: check for additional data
        return null;
    }

    public readItemStackRequest() {
        const id = this.readVarInt();
        this.#server.getLogger().debug(`Request ID: ${id}`);

        const actions = [];
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            actions.push(this.readItemStackRequestAction());
        }

        return new ItemStackRequest({
            id,
            actions: actions.filter(a => a)
        });
    }

    public writeItemStackRequest() {
        // TODO
        this.writeBool(1);
        this.writeVarInt(0);
        this.writeVarInt(0);
    }

    public readItemStackRequestAction() {
        const id = this.readByte();

        this.#server.getLogger().debug(`Action ${id}`);
        switch (id) {
            case 0:  // TODO: enum
                return new ItemStackRequestTake({
                    count: this.readByte(),
                    from: this.readItemStackRequestSlotInfo(),
                    to: this.readItemStackRequestSlotInfo()
                });
            case 1:
                return new ItemStackRequestPlace({
                    count: this.readByte(),
                    from: this.readItemStackRequestSlotInfo(),
                    to: this.readItemStackRequestSlotInfo()
                });
            case 2:
                return new ItemStackRequestSwap({
                    from: this.readItemStackRequestSlotInfo(),
                    to: this.readItemStackRequestSlotInfo()
                });
            case 3:
                return new ItemStackRequestDrop({
                    count: this.readByte(),
                    from: this.readItemStackRequestSlotInfo(),
                    randomly: this.readBool()
                });
            case 4:
                return new ItemStackRequestDestroy({
                    count: this.readByte(),
                    from: this.readItemStackRequestSlotInfo()
                });
            case 5:
                return new ItemStackRequestConsume({
                    count: this.readByte(),
                    from: this.readItemStackRequestSlotInfo()
                });
            case 6:
                return {
                    slot: this.readByte()
                };
            case 7:
                return {};
            case 8:
                return {
                    primaryEffect: this.readVarInt(),
                    secondaryEffect: this.readVarInt()
                };
            case 9:
                return {
                    recipeNetworkId: this.readUnsignedVarInt()
                };
            case 10:
                return {
                    recipeNetworkId: this.readUnsignedVarInt()
                };
            case 11:
                return new ItemStackRequestCreativeCreate({
                    itemId: this.readUnsignedVarInt()
                });
            case 12: // CRAFTING_NON_IMPLEMENTED_DEPRECATED, Deprecated so we'll just ignore it
                this.#server.getLogger().silly('Deprecated readItemStackRequestAction: CRAFTING_NON_IMPLEMENTED_DEPRECATED (12)');
                return {};
            case 13: // CRAFTING_RESULTS_DEPRECATED, Deprecated so we'll just ignore it
                this.#server.getLogger().silly('Deprecated readItemStackRequestAction: CRAFTING_RESULTS_DEPRECATED (13)');
                // We still need to read it...
                let items = [];
                for (let i = 0; i < this.readUnsignedVarInt(); i++) {
                    items.push(this.readItemStack());
                }
                this.readByte();  // times crafted
                return {};
            default:
                this.#server.getLogger().debug(`Unknown item stack request id: ${id}`);
                return {};
        }
    }

    public readItemStackRequestSlotInfo() {
        return {
            containerId: this.readByte(),
            slot: this.readByte(),
            stackNetworkId: this.readVarInt()
        }; // TODO: class
    }

    public readCommandOriginData() {
        let data = new CommandOriginData();
        data.type = this.readUnsignedVarInt();
        data.uuid = this.readUUID();
        data.requestId = this.readString();

        if (data.type === CommandOrigin.DevConsole ||
            data.type === CommandOrigin.Test) {
            data.uniqueEntityId = Number(this.readVarLong());
        }
        return data;
    }

<<<<<<< HEAD:src/network/PacketBinaryStream.ts
    
    private isInt(n: number): boolean {
        return n % 1 === 0;
    }

    private isFloat(n: number): boolean {
        return n % 1 !== 0;
    }

}
export default PacketBinaryStream;
=======
};
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet-binary-stream.js
