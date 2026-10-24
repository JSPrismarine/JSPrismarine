import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Tells a client why its player died, so the death screen can say so.
 *
 * The death screen is the client's own, and it shows this message on it; the chat line
 * everyone else reads goes out separately as a `TextPacket`. The key is sent untranslated and
 * the client renders it in its own language, as the chat line is.
 *
 * **Bound To:** Client
 *
 * Protocol 2193 layout (docs id 189), one `Death Cause Message` as a `DeathCauseMessageType`
 * in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Death Cause Attack Name | string | the bare translation key, such as `death.attack.lava` |
 * | Death Cause Message List | varuint32 count, then that many strings | the key's parameters, the victim first |
 *
 * The key carries no leading `%`. Mojang's docs call it the "untranslated cause of death
 * string", and PocketMine's `DeathPacketHandler` sends the bare `death.attack.*` key with the
 * parameters; its chat packets carry the same bare key, so the `%` convention is the chat
 * packet's own and not this one's.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/death-info-packet/
 * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
 */
export default class DeathInfoPacket extends DataPacket {
    public static NetID = Identifiers.DeathInfoPacket;

    /** Death Cause Attack Name: the bare translation key of the death message. */
    public cause = '';

    /** Death Cause Message List: what fills the key's `%1$s`, `%2$s`, the victim first. */
    public messages: string[] = [];

    /** Reads the key and its parameters. */
    public decodePayload(): void {
        this.cause = NetworkUtil.readString(this);

        this.messages = [];
        let count = this.readUnsignedVarInt();
        while (count-- > 0) {
            this.messages.push(NetworkUtil.readString(this));
        }
    }

    /** Writes the key and its parameters. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.cause);

        this.writeUnsignedVarInt(this.messages.length);
        for (const message of this.messages) {
            NetworkUtil.writeString(this, message);
        }
    }
}
