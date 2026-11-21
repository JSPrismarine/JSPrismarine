/** An entity's state as the plain facts a presenter of another edition shows, read from its Bedrock flags. */
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import type { Metadata } from '@jsprismarine/protocol/bedrock/wire/structures/Metadata';

import type { ShownEntityState } from './SessionPresenter';

/**
 * How an entity carries itself, from the flags replication shows Bedrock clients.
 * @param metadata - The entity's Bedrock metadata.
 */
export const shownEntityStateOf = (metadata: Metadata): ShownEntityState => ({
    onFire: metadata.getGenericFlag(ActorFlags.ONFIRE),
    sneaking: metadata.getGenericFlag(ActorFlags.SNEAKING),
    sprinting: metadata.getGenericFlag(ActorFlags.SPRINTING),
    swimming: metadata.getGenericFlag(ActorFlags.SWIMMING),
    invisible: metadata.getGenericFlag(ActorFlags.INVISIBLE),
    gliding: metadata.getGenericFlag(ActorFlags.GLIDING),
    sleeping: metadata.getGenericFlag(ActorFlags.SLEEPING)
});
