/**
 * Wire types over structures this package still owns, for the declarative definitions that
 * have not moved to `@jsprismarine/protocol` yet.
 *
 * Each wraps an existing hand-written serializer pair as one named `t.custom` wire type, the
 * ADR's escape hatch for a body that resists flat description. A type graduates to the
 * protocol package's `structureTypes` when the structure it carries does.
 *
 * @see `docs/adr/0003-declarative-wire-layouts.md`
 */
import { t } from '@jsprismarine/protocol';

import { Item } from '../../item/Item';

/** `NetworkItemStackDescriptor`: one item stack in the tracked form, without a stack net id. */
export const itemStackDescriptor: t.WireType<Item> = t.custom(
    'NetworkItemStackDescriptor',
    (stream, value) => value.networkSerialize(stream),
    (stream) => Item.networkDeserialize(stream)
);
