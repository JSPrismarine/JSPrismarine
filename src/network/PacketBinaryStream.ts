import BinaryStream from '@jsprismarine/jsbinaryutils';
import NBT from '../nbt/NBT';
import NetworkLittleEndianBinaryStream from '../nbt/streams/NetworkLittleEndianBinaryStream';
import CompoundTag from '../nbt/tags/CompoundTag';
import Prismarine from '../Prismarine';
import Skin from '../utils/skin/skin';
import SkinImage from '../utils/skin/skin-image';
import CreativeContentEntry from './type/creative-content-entry';
import PlayerListEntry from './type/player-list-entry';

const UUID = require('../utils/uuid');
const {FlagType} = require('../entity/metadata');
const CommandOriginData = require('./type/command-origin-data');
const CommandOrigin = require('./type/command-origin');
const SkinAnimation = require('../utils/skin/skin-animation');
const SkinCape = require('../utils/skin/skin-cape');
const SkinPersonaPiece = require('../utils/skin/skin-persona/persona-piece');
const SkinPersona = require('../utils/skin/skin-persona/persona');
const SkinPersonaPieceTintColor = require('../utils/skin/skin-persona/piece-tint-color');

const ItemStackRequest = require('./type/item-stack-requests/item-stack-request');
const ItemStackRequestTake = require('./type/item-stack-requests/take');
const ItemStackRequestPlace = require('./type/item-stack-requests/place');
const ItemStackRequestDrop = require('./type/item-stack-requests/drop');
const ItemStackRequestSwap = require('./type/item-stack-requests/swap');
const ItemStackRequestDestroy = require('./type/item-stack-requests/destroy');
const ItemStackRequestCreativeCreate = require('./type/item-stack-requests/creative-create');
const ItemStackRequestConsume = require('./type/item-stack-requests/consume');

export default class PacketBinaryStream extends BinaryStream {
    #server: Prismarine = Prismarine?.instance as Prismarine;

    getServer(): Prismarine {
        return this.#server;
    }

    /**
     * Returns a string encoded into the buffer.
     */
    readString(): string {
        return this.read(this.readUnsignedVarInt()).toString();
    }

    /**
     * Encodes a string into the buffer.
     */
    writeString(v: string) {
        this.writeUnsignedVarInt(Buffer.byteLength(v));
        this.append(Buffer.from(v, 'utf8'));
    }

    /**
     * @returns {UUID}
     */
    readUUID() {
        let part1 = this.readLInt();
        let part0 = this.readLInt();
        let part3 = this.readLInt();
        let part2 = this.readLInt();

        return new UUID(part0, part1, part2, part3);
    }

    /**
     * Encodes an UUID into the buffer.
     */
    writeUUID(uuid: any) {
        this.writeLInt(uuid.parts[1]);
        this.writeLInt(uuid.parts[0]);
        this.writeLInt(uuid.parts[3]);
        this.writeLInt(uuid.parts[2]);
    }

    /**
     * Retrurns a skin encoded into the buffer.
     */
    readSkin(): Skin {
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
            skin.animations.add(
                new SkinAnimation({
                    image: new SkinImage({
                        width: this.readLInt(),
                        height: this.readLInt(),
                        data: this.readString()
                    }),
                    frames: this.readLFloat(),
                    type: this.readLInt()
                })
            );
        }

        // Read cape image
        skin.cape = new SkinCape();
        skin.cape.image = new SkinImage({
            width: this.readLInt(),
            height: this.readLInt(),
            data: this.readString()
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
                skin.persona.pieces.add(
                    new SkinPersonaPiece({
                        pieceId: this.readString(),
                        pieceType: this.readString(),
                        packId: this.readString(),
                        isDefault: this.readBool(),
                        productId: this.readString()
                    })
                );
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
     * Encodes a skin into the buffer
     */
    writeSkin(skin: Skin) {
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
        this.writeString(skin.animationData);
        this.writeBool((skin.isPremium as unknown) as number);
        this.writeBool((skin.isPersona as unknown) as number);
        this.writeBool((skin.isCapeOnClassicSkin as unknown) as number);
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
                this.writeBool((personaPiece.isDefault as unknown) as number);
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
            this.writeLInt(0); // Persona pieces
            this.writeLInt(0); // Tint colors
        }
    }

    /**
     * Encodes a skin image into the buffer.
     */
    private writeSkinImage(image: SkinImage) {
        this.writeLInt(image.width);
        this.writeLInt(image.height);
        this.writeString(image.data);
    }

    /**
     * Encodes a player list entry into the buffer.
     */
    writePlayerListAddEntry(entry: PlayerListEntry) {
        this.writeUUID(entry.uuid);
        this.writeVarLong(entry.uniqueEntityId);
        this.writeString(entry.name);
        this.writeString(entry.xuid);
        this.writeString(entry.platformChatId);
        this.writeLInt(entry.buildPlatform);
        this.writeSkin(entry.skin);
        this.writeBool((entry.isTeacher as unknown) as number);
        this.writeBool((entry.isHost as unknown) as number);
    }

    /**
     * Removes a player list entry by UUID.
     */
    writePlayerListRemoveEntry(entry: PlayerListEntry) {
        this.writeUUID(entry.uuid);
    }

    writeAttributes(attributes: any) {
        this.writeUnsignedVarInt(attributes.length);
        for (let attribute of attributes) {
            this.writeLFloat(attribute.min);
            this.writeLFloat(attribute.max);
            this.writeLFloat(attribute.value);
            this.writeLFloat(attribute.default);
            this.writeString(attribute.name);
        }
    }
    writeCreativeContentEntry(entry: CreativeContentEntry) {
        this.writeVarInt(entry.entryId);
        this.writeItemStack(entry.item);
    }

    /**
     * Serializes gamerules into the buffer.
     */
    writeGamerules(rules: any) {
        this.writeUnsignedVarInt(rules.size);
        for (let [name, value] of rules) {
            this.writeString(name);
            switch (typeof value) {
                case 'boolean':
                    this.writeByte(1); // maybe value type ??
                    this.writeBool((value as unknown) as number);
                    break;
                case 'number':
                    if (this.isInt(value)) {
                        this.writeByte(2); // maybe value type ??
                        this.writeUnsignedVarInt(value);
                    } else if (this.isFloat(value)) {
                        this.writeByte(3); // maybe value type ??
                        this.writeLFloat(value);
                    }
                    break;
                default:
                    this.#server
                        .getLogger()
                        .error(`Unknown Gamerule type ${value}`);
            }
        }
    }

    private isInt(n: number) {
        return n % 1 === 0;
    }
    private isFloat(n: number) {
        return n % 1 !== 0;
    }

    writeEntityMetadata(metadata: any) {
        this.writeUnsignedVarInt(metadata.size);
        for (const [index, value] of metadata) {
            this.writeUnsignedVarInt(index);
            this.writeUnsignedVarInt(value[0]);
            switch (value[0]) {
                case FlagType.Byte:
                    this.writeByte(value[1]);
                    break;
                case FlagType.Float:
                    this.writeLFloat(value[1]);
                    break;
                case FlagType.Long:
                    this.writeVarLong(value[1]);
                    break;
                case FlagType.String:
                    this.writeString(value[1]);
                    break;
                case FlagType.Short:
                    this.writeLShort(value[1]);
                    break;
                default:
                //this.#server.getLogger().warn(`Unknown meta type ${value}`);
            }
        }
    }

    readItemStack() {
        let id = this.readVarInt();
        if (id == 0) {
            // TODO: items
            return {
                id: 0,
                meta: 0
            };
        }

        let name = null;
        let temp = this.readVarInt();
        let amount = temp & 0xff;
        let meta = temp >> 8;

        let extraLen = this.readLShort();
        let nbt = null;
        if (extraLen == 0xffff) {
            this.readByte(); // ? nbt version
            // As i cannot pass offset by reference, i keep it using this binary stream directly
            let stream = new NetworkLittleEndianBinaryStream(
                this.getBuffer(),
                this.getOffset()
            );
            let decodedNBT = new NBT().readTag(stream, true, true);
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

        // TODO: runtimeId
        // TODO: https://github.com/JSPrismarine/JSPrismarine/issues/106
        return {
            id,
            meta
        };
    }

    /**
     * Serializes an item into the buffer.
     *
     * @param {Item | Block} itemstack
     */
    writeItemStack(itemstack: any) {
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

    readItemStackRequest() {
        const id = this.readVarInt();
        this.#server.getLogger().debug(`Request ID: ${id}`);

        const actions = [];
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            actions.push(this.readItemStackRequestAction());
        }

        return new ItemStackRequest({
            id,
            actions: actions.filter((a) => a)
        });
    }

    writeItemStackRequest() {
        // TODO
        this.writeBool(1);
        this.writeVarInt(0);
        this.writeVarInt(0);
    }

    readItemStackRequestAction() {
        const id = this.readByte();

        this.#server.getLogger().debug(`Action ${id}`);
        switch (id) {
            case 0: // TODO: enum
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
                this.#server
                    .getLogger()
                    .silly(
                        'Deprecated readItemStackRequestAction: CRAFTING_NON_IMPLEMENTED_DEPRECATED (12)'
                    );
                return {};
            case 13: // CRAFTING_RESULTS_DEPRECATED, Deprecated so we'll just ignore it
                this.#server
                    .getLogger()
                    .silly(
                        'Deprecated readItemStackRequestAction: CRAFTING_RESULTS_DEPRECATED (13)'
                    );
                // We still need to read it...
                let items = [];
                for (let i = 0; i < this.readUnsignedVarInt(); i++) {
                    items.push(this.readItemStack());
                }
                this.readByte(); // times crafted
                return {};
            default:
                this.#server
                    .getLogger()
                    .debug(`Unknown item stack request id: ${id}`);
                return {};
        }
    }

    readItemStackRequestSlotInfo() {
        return {
            containerId: this.readByte(),
            slot: this.readByte(),
            stackNetworkId: this.readVarInt()
        }; // TODO: class
    }

    readCommandOriginData() {
        let data = new CommandOriginData();
        data.type = this.readUnsignedVarInt();
        data.uuid = this.readUUID();
        data.requestId = this.readString();

        if (
            data.type === CommandOrigin.DevConsole ||
            data.type === CommandOrigin.Test
        ) {
            data.uniqueEntityId = this.readVarLong();
        }
        return data;
    }
}
