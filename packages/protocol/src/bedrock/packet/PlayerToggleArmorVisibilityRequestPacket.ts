import { playerToggleArmorVisibilityRequestPacket } from '../wire/definitions/added2259';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * The client asks to show or hide its equipped armor.
 *
 * Added at protocol 2259 (Minecraft Preview 1.26.70.24); the layout is read off Mojang's
 * v1.26.70-preview.24 schemas. A codec older than 2259 has no id for it.
 *
 * @see `docs/research/protocol-2259-delta.md`
 */
export default class PlayerToggleArmorVisibilityRequestPacket extends FieldNetworkPacket {
    /** `Hide Armor`. */
    public hideArmor: boolean = false;

    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(playerToggleArmorVisibilityRequestPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(playerToggleArmorVisibilityRequestPacket, this.codecProtocol).decode(this));
    }
}
