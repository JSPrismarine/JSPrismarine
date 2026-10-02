import { ByteReader } from '../util/ByteReader';
import { ByteWriter } from '../util/ByteWriter';
import { CorruptionError } from '../Errors';

/**
 * One file in one level, as the manifest records it. `smallest` and `largest` are internal keys.
 */
export interface FileMetaData {
    number: number;
    size: number;
    smallest: Buffer;
    largest: Buffer;
}

/**
 * A change to the set of live files. The manifest is a log of these; replaying them all in order
 * produces the current state of the database.
 */
export interface VersionEdit {
    comparator?: string;
    logNumber?: number;
    previousLogNumber?: number;
    nextFileNumber?: number;
    lastSequence?: bigint;
    /** Files removed, as `[level, fileNumber]`. */
    deletedFiles?: Array<[number, number]>;
    /** Files added, as `[level, metadata]`. */
    newFiles?: Array<[number, FileMetaData]>;
}

enum Tag {
    Comparator = 1,
    LogNumber = 2,
    NextFileNumber = 3,
    LastSequence = 4,
    CompactPointer = 5,
    DeletedFile = 6,
    NewFile = 7,
    // 8 was a file-number tag that never shipped.
    PreviousLogNumber = 9
}

export const encodeVersionEdit = (edit: VersionEdit): Buffer => {
    const writer = new ByteWriter(256);

    if (edit.comparator !== undefined) {
        writer.varint32(Tag.Comparator).lengthPrefixed(Buffer.from(edit.comparator, 'utf8'));
    }

    if (edit.logNumber !== undefined) writer.varint32(Tag.LogNumber).varint64(BigInt(edit.logNumber));
    if (edit.previousLogNumber !== undefined) {
        writer.varint32(Tag.PreviousLogNumber).varint64(BigInt(edit.previousLogNumber));
    }

    if (edit.nextFileNumber !== undefined) writer.varint32(Tag.NextFileNumber).varint64(BigInt(edit.nextFileNumber));
    if (edit.lastSequence !== undefined) writer.varint32(Tag.LastSequence).varint64(edit.lastSequence);

    for (const [level, number] of edit.deletedFiles ?? []) {
        writer.varint32(Tag.DeletedFile).varint32(level).varint64(BigInt(number));
    }

    for (const [level, file] of edit.newFiles ?? []) {
        writer
            .varint32(Tag.NewFile)
            .varint32(level)
            .varint64(BigInt(file.number))
            .varint64(BigInt(file.size))
            .lengthPrefixed(file.smallest)
            .lengthPrefixed(file.largest);
    }

    return writer.finish();
};

export const decodeVersionEdit = (encoded: Buffer): VersionEdit => {
    const reader = new ByteReader(encoded);
    const edit: VersionEdit = {};

    while (!reader.exhausted) {
        const tag = reader.varint32();

        switch (tag) {
            case Tag.Comparator:
                edit.comparator = reader.lengthPrefixed().toString('utf8');
                break;
            case Tag.LogNumber:
                edit.logNumber = Number(reader.varint64());
                break;
            case Tag.PreviousLogNumber:
                edit.previousLogNumber = Number(reader.varint64());
                break;
            case Tag.NextFileNumber:
                edit.nextFileNumber = Number(reader.varint64());
                break;
            case Tag.LastSequence:
                edit.lastSequence = reader.varint64();
                break;
            case Tag.CompactPointer:
                // Where upstream's next compaction of a level should resume. We pick compactions
                // differently, so this is read past rather than kept - but it must be read past
                // exactly, or every later record in the manifest decodes as garbage.
                reader.varint32();
                reader.lengthPrefixed();
                break;
            case Tag.DeletedFile:
                (edit.deletedFiles ??= []).push([reader.varint32(), Number(reader.varint64())]);
                break;
            case Tag.NewFile: {
                const level = reader.varint32();
                const number = Number(reader.varint64());
                const size = Number(reader.varint64());
                const smallest = Buffer.from(reader.lengthPrefixed());
                const largest = Buffer.from(reader.lengthPrefixed());
                (edit.newFiles ??= []).push([level, { number, size, smallest, largest }]);
                break;
            }

            default:
                throw new CorruptionError(`Manifest record has unknown tag ${tag}`);
        }
    }

    return edit;
};
