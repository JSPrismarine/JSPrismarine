import CustomBinaryStream from "./streams/CustomBinaryStream";
import LittleEndianBinaryStream from "./streams/LittleEndianBinaryStream";
import NetworkLittleEndianBinaryStream from "./streams/NetworkLittleEndianBinaryStream";
import Tag from "./tags/internal/Tag";
import ListTag from "./tags/ListTag";
import CompoundTag from "./tags/CompoundTag";
import StringTag from "./tags/StringTag";
import TagType from "./tags/internal/TagType";
import ByteTag from "./tags/ByteTag";
import ShortTag from "./tags/ShortTag";
import IntTag from "./tags/IntTag";
import EndTag from "./tags/EndTag";

export default class NBT {
    /**
     * Reads a NBT tag from a buffer. 
     */
    public readTag(buffer: CustomBinaryStream, littleEndian = false, varints = false): Tag | null {
        let stream = buffer;

        if (buffer instanceof CustomBinaryStream) {
            stream = buffer;
        } else {
            if (littleEndian && varints) {
                stream = new NetworkLittleEndianBinaryStream(buffer);
            } else if (littleEndian) {
                stream = new LittleEndianBinaryStream(buffer);
            }
        }

        let type = stream.readByte();
        if (type == TagType.End) {
            return new EndTag();
        }

        let name = stream.readString();
        switch (type) {
            case TagType.Byte:
                return new ByteTag(stream.readSignedByte(), name);
            case TagType.Short:
                return new ShortTag(stream.readSignedShort(), name);
            case TagType.Int:
                return new IntTag(stream.readInt(), name);
            case TagType.String:
                let string = stream.readString();
                return new StringTag(string, name);
            case TagType.List:
                let tagType = stream.readByte();
                let listSize = stream.readInt();
                let list = [];
                if (listSize > 0) {
                    for (let i = 0; i < listSize; i++) {
                        // Read from the same offset
                        list.push(this.readTag(
                            stream,
                            true,
                            true
                        ));
                    }
                } else {
                    tagType = TagType.End;
                }
                return new ListTag(list, name, tagType);
            case TagType.Compound:
                let value = [];
                while (true) {
                    let tag = this.readTag(stream, littleEndian, varints);
                    if (tag instanceof EndTag) {
                        value.push(tag);
                        break;
                    }
                    value.push(tag);
                }
                return new CompoundTag(value, name);
            default:
                console.log('Unknown tag with id: ' + type);
        }

        return null;
    }

    public writeTag(buffer: CustomBinaryStream, tag: Tag, littleEndian = false, varints = false): CustomBinaryStream {
        let stream = buffer;

        if (buffer instanceof CustomBinaryStream) {
            stream = buffer;
        } else {
            if (littleEndian && varints) {
                stream = new NetworkLittleEndianBinaryStream(buffer);
            } else if (littleEndian) {
                stream = new LittleEndianBinaryStream(buffer);
            }
        }

        stream.writeByte(tag.type);
        stream.writeString(tag.name);
        
        switch (tag.type) {
            case TagType.Byte:
                stream.writeByte(tag.value);
                break;
            case TagType.Short:
                stream.writeShort(tag.value);
                break;
            case TagType.Int:
                stream.writeInt(tag.value);
                break;
            case TagType.String:
                stream.writeString(tag.value);
                break;
            case TagType.List:
                if (!(tag instanceof ListTag)) break;
                stream.writeByte(tag.tagType);
                stream.writeInt(tag.value.length ?? 0);
                for (let valueTag of tag.value) {
                    stream = this.writeTag(stream, valueTag, littleEndian, varints);
                }
                break;
            case TagType.Compound:
                for (let valueTag of tag.value.values()) {
                    stream = this.writeTag(stream, valueTag, littleEndian, varints);
                }
                stream.writeByte(TagType.End);
                break;
            case TagType.End:
                stream.writeByte(TagType.End);
                break;
            default:
                console.log('Unknown tag with id: ' + tag.type);
        }

        return stream;
    }
};
