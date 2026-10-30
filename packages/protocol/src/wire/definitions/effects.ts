/**
 * The visual effect packets, layouts unchanged between protocols 2193 and 2225. Field names
 * and order follow each packet's docs page.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * The `OnScreenTextureAnimationPacket` field list: a full-screen texture animation, such as
 * the flash when a totem of undying fires.
 *
 * `Effect Id` is a little-endian uint32 rather than a varint, and it is the whole payload.
 */
export const onScreenTextureAnimationPacket = definePacket('OnScreenTextureAnimationPacket', {
    /** `Effect Id`: which animation to play. */
    animationType: t.lu32
});

/** What `OnScreenTextureAnimationPacket` carries; derived from the field list. */
export type OnScreenTextureAnimationPayload = PayloadOf<typeof onScreenTextureAnimationPacket>;
