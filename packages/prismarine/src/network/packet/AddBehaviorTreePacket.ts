import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Hands the client a behavior tree as JSON.
 *
 * Wire order at protocol 2193: `Behavior Tree Structure (JSON)` as a string, and nothing
 * else. Neither the vanilla client nor the vanilla server does anything with it.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-behavior-tree-packet/
 */
export default class AddBehaviorTreePacket extends FieldNetworkPacket {
    /** The tree as a JSON document. */
    public behaviorTreeStructure = '';

    /** Reads the JSON string. */
    public decodePayload(): void {
        this.behaviorTreeStructure = NetworkUtil.readString(this);
    }

    /** Writes the JSON string. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.behaviorTreeStructure);
    }
}
