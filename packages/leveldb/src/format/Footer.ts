import { ByteReader } from '../util/ByteReader';
import { ByteWriter } from '../util/ByteWriter';
import { LeveldbErrors } from '@jsprismarine/errors/leveldb';

/** Where a block lives in a table file. Encoded as two varint64s wherever it appears. */
export interface BlockHandle {
    offset: number;
    size: number;
}

export const writeBlockHandle = (writer: ByteWriter, handle: BlockHandle): void => {
    writer.varint64(BigInt(handle.offset)).varint64(BigInt(handle.size));
};

export const readBlockHandle = (reader: ByteReader): BlockHandle => ({
    offset: Number(reader.varint64()),
    size: Number(reader.varint64())
});

/** The compression type byte and masked CRC-32C that follow every block in a table. */
export const BLOCK_TRAILER_LENGTH = 5;

/**
 * The last 48 bytes of every table: the two block handles, zero padding out to 40 bytes, then an
 * 8 byte magic number. The fixed size is what lets a reader find the index without scanning, so
 * the padding is not optional - a footer that is 47 bytes long is an unopenable table.
 *
 * The magic is the first 8 bytes of the SHA-1 of "http://code.google.com/p/leveldb/".
 */
export const FOOTER_LENGTH = 48;
export const TABLE_MAGIC = 0xdb4775248b80fb57n;

export interface Footer {
    metaIndexHandle: BlockHandle;
    indexHandle: BlockHandle;
}

export const encodeFooter = (footer: Footer): Buffer => {
    const writer = new ByteWriter(FOOTER_LENGTH);
    writeBlockHandle(writer, footer.metaIndexHandle);
    writeBlockHandle(writer, footer.indexHandle);

    const handles = writer.finish();
    if (handles.byteLength > FOOTER_LENGTH - 8) {
        throw new LeveldbErrors.FooterHandlesTooLarge();
    }

    const encoded = Buffer.alloc(FOOTER_LENGTH);
    handles.copy(encoded, 0);
    encoded.writeBigUInt64LE(TABLE_MAGIC, FOOTER_LENGTH - 8);
    return encoded;
};

export const decodeFooter = (encoded: Buffer): Footer => {
    if (encoded.byteLength !== FOOTER_LENGTH) {
        throw new LeveldbErrors.FooterWrongSize({ byteLength: encoded.byteLength, footerLength: FOOTER_LENGTH });
    }

    if (encoded.readBigUInt64LE(FOOTER_LENGTH - 8) !== TABLE_MAGIC) {
        throw new LeveldbErrors.NotLeveldbTable();
    }

    const reader = new ByteReader(encoded, 0, FOOTER_LENGTH - 8);
    return { metaIndexHandle: readBlockHandle(reader), indexHandle: readBlockHandle(reader) };
};
