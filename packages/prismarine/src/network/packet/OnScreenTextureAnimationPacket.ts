import { layoutAt, onScreenTextureAnimationPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * Plays a full-screen texture animation, such as the flash when a totem of undying fires.
 *
 * Bound to the client. The wire layout lives in `@jsprismarine/protocol`'s
 * `onScreenTextureAnimationPacket` definition: `Effect Id` as a little-endian uint32, and
 * nothing else.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/on-screen-texture-animation-packet/
 */
export default class OnScreenTextureAnimationPacket extends DataPacket {
    /** `Effect Id`: which animation to play. */
    public animationType!: number;

    /** Reads the effect id. */
    public decodePayload(): void {
        this.animationType = layoutAt(onScreenTextureAnimationPacket, this.codecProtocol).decode(this).animationType;
    }

    /** Writes the effect id. */
    public encodePayload(): void {
        layoutAt(onScreenTextureAnimationPacket, this.codecProtocol).encode(this, {
            animationType: this.animationType
        });
    }
}
