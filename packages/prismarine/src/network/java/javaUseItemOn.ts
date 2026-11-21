/**
 * A Java client's `Use Item On` as the `useItemOnBlock` intent
 * ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 */
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import type { UseItemOn } from '@jsprismarine/protocol/java/packet/play';
import { JavaHand } from '@jsprismarine/protocol/java/packet/play';

import type { Intent } from '../../input/Intent';

/** The `Use Item On` fields, as the packet decodes. */
type UseItemOnFields = typeof UseItemOn extends JavaPacketDefinition<infer T> ? T : never;

/**
 * The intent a `Use Item On` decodes into.
 *
 * A Java client tries the main hand first and sends the off hand's use only when the main hand
 * did nothing on its side. The server places what the main hand holds whichever hand the packet
 * names, so the off hand's would place the same block twice and is not decoded.
 * @param packet - The packet.
 * @returns The intent, or undefined for the off hand.
 */
export const javaUseItemOnIntentOf = ({
    hand,
    position,
    face,
    cursorX,
    cursorY,
    cursorZ
}: UseItemOnFields): Intent<'useItemOnBlock'> | undefined =>
    hand === JavaHand.Main
        ? { kind: 'useItemOnBlock', position, face, faceLocation: { x: cursorX, y: cursorY, z: cursorZ } }
        : undefined;
