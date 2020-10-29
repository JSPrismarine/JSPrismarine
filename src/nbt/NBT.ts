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
    readTag(buffer: CustomBinaryStream, littleEndian = false, varints = false): Tag | null {
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
                let listType = stream.readByte();
                let listSize = stream.readInt();
                let list = [];
                for (let i = 0; i < listSize; i++) {
                    // Read from the same offset
                    list.push(this.readTag(
                        stream,
                        true,
                        true
                    ));
                }
                return new ListTag(listType, list, name);
            case TagType.Compound:
                let value: any = {};
                while (true) {
                    let tag = this.readTag(stream, true, true);

                    if (!tag || tag instanceof EndTag)
                        break;

                    value[tag.name] = tag;
                }
                return new CompoundTag(value, name);
            default:
                console.log('Unknown tag with id: ' + type);
        }

        return null;
    }

}
