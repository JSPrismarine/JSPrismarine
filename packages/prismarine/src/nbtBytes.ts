/**
 * A compound as network NBT bytes and back, the form the change log keeps NBT in: a typed array is
 * plain data, and the bytes keep every tag type a plain number would lose.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';

/** A compound's tags as network NBT bytes. */
export const nbtBytesOf = (tags: NBTTagCompound): Uint8Array => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(tags);
    // A copy, not the stream's `Buffer`: plain data compares typed arrays by their constructor.
    return new Uint8Array(stream.getBuffer());
};

/** The compound network NBT bytes hold, as a new compound each call. */
export const nbtOfBytes = (bytes: Uint8Array): NBTTagCompound =>
    NBTTagCompound.readFromStream(new BinaryStream(Buffer.from(bytes)), ByteOrder.LITTLE_ENDIAN, true);

/** A compound's tags as network NBT bytes in base64, for a record kept as JSON. */
export const nbtBase64Of = (tags: NBTTagCompound): string => Buffer.from(nbtBytesOf(tags)).toString('base64');

/**
 * The compound a base64 text of network NBT bytes holds, or undefined for text that is not one:
 * a hand-edited record costs its tags and nothing else.
 */
export const nbtOfBase64 = (text: string): NBTTagCompound | undefined => {
    try {
        return nbtOfBytes(Buffer.from(text, 'base64'));
    } catch {
        return undefined;
    }
};
