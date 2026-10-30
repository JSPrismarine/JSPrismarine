/**
 * The changed attributes for one entity, including each attribute's bounds, current value,
 * name, and modifiers.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-attributes-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { Attribute } from '../structures/Attribute';

/**
 * One `AttributeData` entry: the six bounds and value floats, the name, then the modifiers,
 * bridged from the hand-written `Attribute` serializer pair.
 */
const attribute = t.custom<Attribute>(
    'AttributeData',
    (stream, value) => value.networkSerialize(stream),
    (stream) => Attribute.networkDeserialize(stream)
);

/** The `UpdateAttributesPacket` field list; the class doc carries the wire provenance. */
export const updateAttributesPacket = definePacket('UpdateAttributesPacket', {
    /** `Target Runtime ID`: the entity whose attributes changed. */
    runtimeEntityId: t.varuint64,
    /** `Attribute List`: only the attributes that changed need to be present. */
    attributes: t.list(attribute),
    /** `Tick`, a `PlayerInputTick`; see the class doc for what the server fills in. */
    tick: t.varuint64
});
