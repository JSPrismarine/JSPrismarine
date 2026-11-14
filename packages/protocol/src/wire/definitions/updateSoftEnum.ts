/**
 * `UpdateSoftEnumPacket`: changes the values of a soft enum the client already has.
 *
 * The payload is the enum's name, a list of values, and the operation to apply, in the order on
 * Mojang's packet page.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-soft-enum-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** What to do with the values in a soft enum update. */
export enum SoftEnumUpdateType {
    /** Add these values to the enum the client already has. */
    ADD,
    /** Remove these values from the enum. */
    REMOVE,
    /** Replace the enum's current values with these values. */
    REPLACE
}

const stringList = t.list(t.string);

/** `Values`: a varuint32 count followed by that many strings, held as a read-only list. */
const values = t.custom<readonly string[]>(
    stringList.wire,
    (stream, value) => stringList.write(stream, [...value]),
    (stream) => stringList.read(stream)
);

/** `Update Type`: one uint8 that decoding rejects when it is not a {@link SoftEnumUpdateType}. */
const updateType = t.custom<SoftEnumUpdateType>(
    t.uint8.wire,
    (stream, value) => t.uint8.write(stream, value),
    (stream) => {
        const type = t.uint8.read(stream);
        switch (type) {
            case SoftEnumUpdateType.ADD:
            case SoftEnumUpdateType.REMOVE:
            case SoftEnumUpdateType.REPLACE:
                return type;
            default:
                throw new Error(`Unknown soft enum update type ${type}`);
        }
    }
);

/** The fields sent to change one soft enum's values. */
export const updateSoftEnumPacket = definePacket('UpdateSoftEnumPacket', {
    /** `Enum Name`: the soft enum declared in `AvailableCommandsPacket`. */
    enumName: t.string,
    /** `Values`: the values to add, remove, or use as the replacement set. */
    values,
    /** `Update Type`: the operation applied to the named enum. */
    type: updateType
});

/** A command enum update sent to the client. */
export type UpdateSoftEnumPayload = PayloadOf<typeof updateSoftEnumPacket>;
