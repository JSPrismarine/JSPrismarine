/**
 * `UpdateAttributesPacket`: an entity's changed attributes, described as a declarative field
 * list; layout unchanged between protocols 2193 and 2225.
 *
 * This definition lives beside the class because `Attribute` is prismarine-owned; it moves to
 * `@jsprismarine/protocol`'s registry when the structure does.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-attributes-packet/}
 */
import { definePacket, t } from '@jsprismarine/protocol';
import { Attribute } from '../../entity/Attribute';

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
