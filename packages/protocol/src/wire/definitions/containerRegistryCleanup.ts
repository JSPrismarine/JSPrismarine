/**
 * `ContainerRegistryCleanupPacket`: tells the client which dynamic containers to forget.
 *
 * The payload is a varuint32 count followed by one `FullContainerName` per container the
 * server's registry dropped.
 *
 * The 1.26.50 page lists `Dynamic ID` as a
 * plain uint32 and the 1.26.60 page lists it as an optional with a changelog row saying it "is
 * now optional"; Mojang's note for that build calls the optionality rows a docs correction
 * (`docs/research/protocol-2225-delta.md`), so the presence byte is written at both versions.
 * `Container Name` is numbered as Mojang's pinned `enums.html` dump numbers `ContainerEnumName`
 * (`RecipeFoodContainer` 64, `DynamicContainer` 63), not as the dense 1.26.50 page does;
 * `ContainerRegistryCleanupPacket.test.ts` asserts the numbering against the dump.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/container-registry-cleanup-packet/
 */
import FullContainerName from '../../structure/FullContainerName';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

const optionalDynamicId = t.optional(t.lu32);

/**
 * `FullContainerName`: a `Container Name` byte, then `Dynamic ID` as a presence byte and a
 * little-endian uint32 when present. Handed back as the `FullContainerName` structure the
 * packet's callers already hold.
 */
const fullContainerName: WireType<FullContainerName> = t.custom(
    'FullContainerName',
    (stream, value) => {
        t.uint8.write(stream, value.containerId);
        optionalDynamicId.write(stream, value.dynamicId);
    },
    (stream) => new FullContainerName(t.uint8.read(stream), optionalDynamicId.read(stream))
);

/** The `ContainerRegistryCleanupPacket` field list. */
export const containerRegistryCleanupPacket = definePacket('ContainerRegistryCleanupPacket', {
    /** `Removed Containers`: one `FullContainerName` per container the server's registry dropped. */
    removedContainers: t.list(fullContainerName)
});

/** Payload carried by `ContainerRegistryCleanupPacket`. */
export type ContainerRegistryCleanupPayload = PayloadOf<typeof containerRegistryCleanupPacket>;
