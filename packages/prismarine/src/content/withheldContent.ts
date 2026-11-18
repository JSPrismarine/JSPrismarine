/**
 * The vanilla content a release lacks, which `protocol-content: oldest` keeps out of the world
 * ([ADR 0025](../../../../docs/adr/0025-older-protocols-are-a-window-relative-to-the-newest-release.md)).
 *
 * Measured against the world's own release, the newest: a block its catalog has and the
 * release's does not, an item its table names and the release's does not, and an actor type it
 * lists and the release does not. A pack's own content is in no capture, so it is never
 * withheld.
 */
import type { ProtocolCodec } from '@jsprismarine/protocol';

import { missingVanillaActors } from '../network/codec/actorTypes';
import { missingVanillaBlocks } from '../network/codec/blockTranslation';
import { missingVanillaItems } from '../network/codec/itemData';

/** Vanilla identifiers the content build leaves out, by registry. */
export interface WithheldContent {
    readonly blocks: ReadonlySet<string>;
    readonly items: ReadonlySet<string>;
    readonly entities: ReadonlySet<string>;
}

/** What a server whose content is the world's own release withholds. */
export const NOTHING_WITHHELD: WithheldContent = { blocks: new Set(), items: new Set(), entities: new Set() };

/**
 * The vanilla content a release does not have.
 * @param codec - The release's codec.
 * @returns What a world on that release's content leaves out, or a session on it is sent a
 *   substitute for.
 */
export const contentMissingAt = (codec: ProtocolCodec): WithheldContent => ({
    blocks: new Set(missingVanillaBlocks(codec.protocolVersion)),
    items: new Set(missingVanillaItems(codec.itemData)),
    entities: new Set(missingVanillaActors(codec.context))
});

/**
 * Every withheld identifier, for a log line.
 * @param withheld - What a release lacks.
 * @returns The identifiers, deduplicated and sorted.
 */
export const withheldNames = (withheld: WithheldContent): string[] =>
    [...new Set([...withheld.blocks, ...withheld.items, ...withheld.entities])].sort();
