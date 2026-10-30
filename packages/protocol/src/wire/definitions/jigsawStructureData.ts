/**
 * The jigsaw structure rules the client needs before starting the world. The captured NBT
 * payload is carried through to the end of the packet.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/jigsaw-structure-data-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/**
 * `Structure Data`: one network little-endian NBT compound with no length prefix, running to
 * the end of the packet. This server defines no jigsaw rules of its own and replays a captured
 * vanilla payload verbatim, so the bytes travel untouched.
 */
const networkNbtTail = t.custom<Buffer>(
    'NetworkNbtTail',
    (s, v) => s.write(v),
    (s) => s.readRemaining()
);

/**
 * The `JigsawStructureDataPacket` field list: the jigsaw structure rules, which the client
 * wants before `StartGamePacket` or it disconnects with `MissingStructureData`.
 */
export const jigsawStructureDataPacket = definePacket('JigsawStructureDataPacket', {
    /** `Structure Data`: the rules as network NBT; see {@link networkNbtTail}. */
    structureData: networkNbtTail
});
