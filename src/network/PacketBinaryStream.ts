import BinaryStream from '@jsprismarine/jsbinaryutils';
import { Attribute } from '../entity/attribute';
import { FlagType } from '../entity/metadata';
import ContainerEntry from '../inventory/ContainerEntry';
import Vector3 from '../math/Vector3';
import Skin from '../utils/skin/Skin';
import SkinImage from '../utils/skin/SkinImage';
import UUID from '../utils/UUID';
import BlockPosition from '../world/BlockPosition';
import { PlayerListEntry } from './packet/PlayerListPacket';
import CommandOriginData from './type/CommandOriginData';
import CommandOriginType from './type/CommandOriginType';
import CreativeContentEntry from './type/CreativeContentEntry';
import ItemStackRequestConsume from './type/itemStackRequest/ConsumeStack';
import ItemStackRequestCreativeCreate from './type/itemStackRequest/CreativeCreate';
import ItemStackRequestDestroy from './type/itemStackRequest/Destroy';
import ItemStackRequestDrop from './type/itemStackRequest/Drop';
import ItemStackRequest from './type/itemStackRequest/ItemStackRequest';
import ItemStackRequestSlotInfo from './type/itemStackRequest/ItemStackRequestSlotInfo';
import ItemStackRequestPlace from './type/itemStackRequest/Place';
import ItemStackRequestSwap from './type/itemStackRequest/Swap';
import ItemStackRequestTake from './type/itemStackRequest/Take';
export default class PacketBinaryStream extends BinaryStream {
    /**
     * Returns a string encoded into the buffer.
     */
    public readString(): string {
        return this.read(this.readUnsignedVarInt()).toString();
    }

    /**
     * Encodes a string into the buffer.
     */
    public writeString(v: string): void {
        this.writeUnsignedVarInt(Buffer.byteLength(v));
        this.append(Buffer.from(v, 'utf8'));
    }

    /**
     * Returns a Vector3 encoded into the buffer.
     */
    public readVector3(): Vector3 {
        return new Vector3(
            this.readLFloat(),
            this.readLFloat(),
            this.readLFloat()
        );
    }

    /**
     * Encodes a Vector3 into the buffer.
     */
    public writeVector3(position: Vector3): void {
        this.writeLFloat(position.getX());
        this.writeLFloat(position.getY());
        this.writeLFloat(position.getZ());
    }

    public readUUID(): UUID {
        const part1 = this.readLInt();
        const part0 = this.readLInt();
        const part3 = this.readLInt();
        const part2 = this.readLInt();

        return new UUID(part0, part1, part2, part3);
    }

    public readBlockPosition(): BlockPosition {
        return new BlockPosition(
            this.readVarInt(),
            this.readUnsignedVarInt(),
            this.readVarInt()
        );
    }

    public writeBlockPosition(position: BlockPosition): void {
        this.writeVarInt(position.getX());
        this.writeUnsignedVarInt(position.getY());
        this.writeVarInt(position.getZ());
    }

    /**
     * Encodes an UUID into the buffer.
     */
    public writeUUID(uuid: UUID): void {
        const parts = uuid.getParts();
        this.writeLInt(parts[1]);
        this.writeLInt(parts[0]);
        this.writeLInt(parts[3]);
        this.writeLInt(parts[2]);
    }

    /**
     * TODO: api from data
     * Retrurns a skin encoded into the buffer.
     *
    readSkin(): Skin {
        let skin = new Skin();
        skin.id = this.readString();
        skin.resourcePatch = this.readString();

        // Read skin image
        skin.image = new SkinImage({
            width: this.readLInt(),
            height: this.readLInt(),
            data: this.read(this.readUnsignedVarInt())
        });

        // Read animations
        let animationCount = this.readLInt();
        for (let i = 0; i < animationCount; i++) {
            skin.animations.add(
                new SkinAnimation({
                    image: new SkinImage({
                        width: this.readLInt(),
                        height: this.readLInt(),
                        data: this.read(this.readUnsignedVarInt())
                    }),
                    frames: this.readLFloat(),
                    type: this.readLInt(),
                    expression: this.readLInt()
                })
            );
        }

        // Read cape image
        skin.cape = new SkinCape();
        skin.cape.image = new SkinImage({
            width: this.readLInt(),
            height: this.readLInt(),
            data: this.read(this.readUnsignedVarInt())
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
    } */

    /**
     * Encodes a skin into the buffer
     */
    public writeSkin(skin: Skin): void {
        this.writeString(skin.getId());
        this.writeString(skin.getResourcePatch());

        // Skin image
        this.writeSkinImage(skin.getImage());

        // Animations
        this.writeLInt(skin.getAnimations().size);
        for (const animation of skin.getAnimations()) {
            this.writeSkinImage(animation.getImage());
            this.writeLInt(animation.getType());
            this.writeLFloat(animation.getFrames());
            this.writeLInt(animation.getExpression());
        }

        // Cape image
        this.writeSkinImage(skin.getCape().getImage());

        // Miscellaneus
        this.writeString(skin.getGeometry());
        this.writeString(skin.getAnimationData());
        this.writeBool(skin.isPremium());
        this.writeBool(skin.isPersona());
        this.writeBool(skin.isCapeOnClassicSkin());
        this.writeString(skin.getCape().getId());
        this.writeString(skin.getFullId());
        this.writeString(skin.getArmSize());
        this.writeString(skin.getColor());

        // Hack to keep less useless data in software
        if (skin.isPersona()) {
            this.writeLInt(skin.getPersonaData().getPieces().size);
            for (const personaPiece of skin.getPersonaData().getPieces()) {
                this.writeString(personaPiece.getPieceId());
                this.writeString(personaPiece.getPieceType());
                this.writeString(personaPiece.getPackId());
                this.writeBool(personaPiece.isDefault());
                this.writeString(personaPiece.getProductId());
            }

            this.writeLInt(skin.getPersonaData().getTintColors().size);
            for (const tint of skin.getPersonaData().getTintColors()) {
                this.writeString(tint.getPieceType());
                this.writeLInt(tint.getColors().length);
                for (const color of tint.getColors()) {
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
        this.writeUnsignedVarInt(image.data.length);
        this.append(image.data);
    }

    /**
     * Encodes a player list entry into the buffer.
     */
    public writePlayerListAddEntry(entry: PlayerListEntry): void {
        this.writeVarLong(entry.getUniqueEntityId() as bigint);
        this.writeString(entry.getName() as string);
        this.writeString(entry.getXUID());
        this.writeString(entry.getPlatformChatId() as string);
        this.writeLInt(entry.getBuildPlatform() as number);
        this.writeSkin(entry.getSkin() as Skin);
        this.writeBool(entry.isTeacher());
        this.writeBool(entry.isHost());
    }

    public writeAttributes(attributes: Attribute[]): void {
        this.writeUnsignedVarInt(attributes.length);
        for (const attribute of attributes) {
            this.writeLFloat(attribute.getMin());
            this.writeLFloat(attribute.getMax());
            this.writeLFloat(attribute.getValue());
            this.writeLFloat(attribute.getDefault());
            this.writeString(attribute.getName());
        }
    }

    writeCreativeContentEntry(entry: CreativeContentEntry) {
        this.writeVarInt(entry.entryId);
        this.writeItemStack(new ContainerEntry({ item: entry.item, count: 1 }));
    }

    readCreativeContentEntry() {
        return {
            entryId: this.readVarInt(),
            item: this.readItemStack()
        };
    }

    /**
     * Serializes gamerules into the buffer.
     */
    writeGamerules(rules: any) {
        this.writeUnsignedVarInt(rules.size);
        for (const [name, value] of rules) {
            this.writeString(name);
            switch (typeof value) {
                case 'boolean':
                    this.writeByte(1); // Maybe value type ??
                    this.writeBool(value);
                    break;
                case 'number':
                    if (this.isInt(value)) {
                        this.writeByte(2); // Maybe value type ??
                        this.writeUnsignedVarInt(value);
                    } else if (this.isFloat(value)) {
                        this.writeByte(3); // Maybe value type ??
                        this.writeLFloat(value);
                    }

                    break;
                default:
                /* This.#server
                        .getLogger()
                        .error(`Unknown Gamerule type ${value}`); */
            }
        }
    }

    private isInt(n: number) {
        return n % 1 === 0;
    }

    private isFloat(n: number) {
        return n % 1 !== 0;
    }

    public writeEntityMetadata(
        metadata: Map<number, [number, string | number | bigint | boolean]>
    ) {
        this.writeUnsignedVarInt(metadata.size);
        for (const [index, value] of metadata) {
            this.writeUnsignedVarInt(index);
            this.writeUnsignedVarInt(value[0]);
            switch (value[0]) {
                case FlagType.BYTE:
                    this.writeByte(value[1] as number);
                    break;
                case FlagType.FLOAT:
                    this.writeLFloat(value[1] as number);
                    break;
                case FlagType.LONG:
                    this.writeVarLong(value[1] as bigint);
                    break;
                case FlagType.STRING:
                    this.writeString(value[1] as string);
                    break;
                case FlagType.SHORT:
                    this.writeLShort(value[1] as number);
                    break;
                default:
                // This.#server.getLogger().warn(`Unknown meta type ${value}`);
            }
        }
    }

    readItemStack() {
        const id = this.readVarInt();
        if (id === 0) {
            // TODO: items
            return {
                id: 0,
                meta: 0
            };
        }

        const temporary = this.readVarInt();
        const meta = temporary >> 8;

        const extraLength = this.readLShort();
        if (extraLength === 0xffff) {
            this.readByte(); // ? nbt version
            // As i cannot pass offset by reference, i keep it using this binary stream directly
            /* let stream = new NetworkLittleEndianBinaryStream(
                this.getBuffer(),
                this.getOffset()
            );
            let decodedNBT = new NBT().readTag(stream, true, true);
            if (!(decodedNBT instanceof CompoundTag)) {
                throw new Error('Invalid NBT root tag for itemstack');
            }
            nbt = decodedNBT;
            (this as any).offset = stream.getOffset(); */
        } else if (extraLength !== 0) {
            throw new Error(`Invalid NBT itemstack length ${extraLength}`);
        }

        const countPlaceOn = this.readVarInt();
        for (let i = 0; i < countPlaceOn; i++) {
            this.readString();
        }

        const countCanBreak = this.readVarInt();
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
     */
    writeItemStack(entry: ContainerEntry) {
        const itemstack = entry.getItem();

        if (itemstack.name === 'minecraft:air') {
            return this.writeVarInt(0);
        }

        this.writeVarInt(itemstack.getId());
        this.writeVarInt(((itemstack.meta & 0x7fff) << 8) | entry.getCount());

        if (itemstack.nbt !== null) {
            // Write the amount of tags to write
            // (1) according to vanilla
            this.writeLShort(0xffff);
            this.writeByte(1);

            // Write hardcoded NBT tag
            // TODO: unimplemented NBT.write(nbt, true, true)
        } else {
            this.writeLShort(0);
        }

        // CanPlace and canBreak
        this.writeVarInt(0);
        this.writeVarInt(0);

        // TODO: check for additional data
        return null;
    }

    readItemStackRequest() {
        const id = this.readVarInt();
        // This.#server.getLogger().debug(`Request ID: ${id}`);

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
        this.writeBool(true);
        this.writeVarInt(0);
        this.writeVarInt(0);
    }

    readItemStackRequestAction() {
        const id = this.readByte();

        // This.#server.getLogger().debug(`Action ${id}`);
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
                /* this.#server
                    .getLogger()
                    .silly(
                        'Deprecated readItemStackRequestAction: CRAFTING_NON_IMPLEMENTED_DEPRECATED (12)'
                    ); */
                return {};
            case 13: {
                // CRAFTING_RESULTS_DEPRECATED, Deprecated so we'll just ignore it
                /* this.#server
                    .getLogger()
                    .silly(
                        'Deprecated readItemStackRequestAction: CRAFTING_RESULTS_DEPRECATED (13)'
                    ); */
                // We still need to read it...
                const items = [];
                for (let i = 0; i < this.readUnsignedVarInt(); i++) {
                    items.push(this.readItemStack());
                }

                this.readByte(); // Times crafted
                return {};
            }
            default:
                /* This.#server
                    .getLogger()
                    .debug(`Unknown item stack request id: ${id}`); */
                return {};
        }
    }

    readItemStackRequestSlotInfo() {
        return new ItemStackRequestSlotInfo({
            containerId: this.readByte(),
            slot: this.readByte(),
            stackNetworkId: this.readVarInt()
        });
    }

    readCommandOriginData() {
        const data = new CommandOriginData();
        data.type = this.readUnsignedVarInt();
        data.uuid = this.readUUID();
        data.requestId = this.readString();

        if (
            data.type === CommandOriginType.DevConsole ||
            data.type === CommandOriginType.Test
        ) {
            data.uniqueEntityId = this.readVarLong();
        }

        return data;
    }
}
