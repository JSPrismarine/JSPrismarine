/**
 * `ServerboundPackSettingChangePacket`: the client reporting a changed resource pack setting.
 *
 * Protocol 2193 layout: `Pack Id` as an `mce::UUID`, `Pack Setting Name` as a string, then
 * `Pack Setting Value` as a varuint32 selector and a float, boolean, string, or string list.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-pack-setting-change-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { uuid } from '../structureTypes';

import type { PayloadOf } from '../define';

/** A pack setting value in one of the alternatives the packet carries. */
export type PackSettingValue = number | boolean | string | string[];

/** Selectors for the `PackSettingValue` alternatives, in wire order. */
export enum PackSettingValueType {
    Float = 0,
    Bool = 1,
    String = 2,
    StringList = 3
}

/**
 * `Pack Setting Value`: a varuint32 selector, then the alternative it names. The value's
 * JavaScript type picks the selector on write; an unknown selector is a malformed packet on read.
 * Custom because the alternative that follows depends on the selector just read.
 */
const packSettingValue = t.custom<PackSettingValue>(
    'Pack Setting Value',
    (stream, value) => {
        if (typeof value === 'number') {
            t.varuint32.write(stream, PackSettingValueType.Float);
            t.lf32.write(stream, value);
        } else if (typeof value === 'boolean') {
            t.varuint32.write(stream, PackSettingValueType.Bool);
            t.bool.write(stream, value);
        } else if (typeof value === 'string') {
            t.varuint32.write(stream, PackSettingValueType.String);
            t.string.write(stream, value);
        } else {
            t.varuint32.write(stream, PackSettingValueType.StringList);
            t.list(t.string).write(stream, value);
        }
    },
    (stream) => {
        const selector = t.varuint32.read(stream);

        switch (selector) {
            case PackSettingValueType.Float:
                return t.lf32.read(stream);
            case PackSettingValueType.Bool:
                return t.bool.read(stream);
            case PackSettingValueType.String:
                return t.string.read(stream);
            case PackSettingValueType.StringList:
                return t.list(t.string).read(stream);
            default:
                throw new Error(`Unknown pack setting value alternative ${selector}`);
        }
    }
);

/** The fields sent when the player changes a setting in a resource pack. */
export const serverboundPackSettingChangePacket = definePacket('ServerboundPackSettingChangePacket', {
    /** `Pack Id`: UUID of the pack whose setting changed. */
    packId: uuid,
    /** `Pack Setting Name`: name of the setting in the pack's settings screen. */
    packSettingName: t.string,
    /** `Pack Setting Value`: new value, whose JavaScript type selects the wire alternative. */
    packSettingValue
});

/** Payload carried by `ServerboundPackSettingChangePacket`. */
export type ServerboundPackSettingChange = PayloadOf<typeof serverboundPackSettingChangePacket>;
