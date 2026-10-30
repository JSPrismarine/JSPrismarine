import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';
import { gameRulesChangedPacket } from '../wire/definitions/gameRulesChanged';

import type { GameRule } from '../wire/structures/GameRule';

/**
 * Tells a client that game rules changed.
 *
 * **Bound To:** Client
 *
 * Only the rules that changed need to go out, and only the ones the client acts on matter:
 * rules the server resolves alone, such as `keepInventory`, change nothing client side.
 *
 * Protocol 2193 layout (docs id 72), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Rule Data | GameRulesChangedPacketData | A varuint32 count, then one {@link GameRule} each |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/game-rules-changed-packet/
 */
export default class GameRulesChangedPacket extends FieldNetworkPacket {
    /** Rules List, the rules whose values changed. */
    public rulesList: GameRule[] = [];

    /** Reads the rules list. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(gameRulesChangedPacket, this.codecProtocol).decode(this));
    }

    /** Writes the rules list. */
    public encodePayload(): void {
        layoutAt(gameRulesChangedPacket, this.codecProtocol).encode(this, this);
    }
}
