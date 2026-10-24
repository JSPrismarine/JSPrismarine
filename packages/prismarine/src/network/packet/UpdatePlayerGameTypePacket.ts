import { Gametype } from '@jsprismarine/minecraft';

import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * A player's new game type, sent to every client so each one updates its cached copy.
 *
 * Bound to the client. The server sends it after it accepts a `SetPlayerGameTypePacket`, to
 * the player who asked and to everyone else, because each client keeps the game type and
 * permission flags of every player it knows about.
 *
 * Wire order at protocol 2193: Player Game Type as a ZigZag varint32, Target player as an
 * `ActorUniqueID` (ZigZag varint64), and Tick as a `PlayerInputTick` (plain LEB128
 * varuint64). The tick matters when the change moves a player into or out of spectator while
 * they are moving; zero is accepted and costs a little smoothness.
 *
 * The 2193 page numbers `GameType` from zero in listing order. Those are list indices, which
 * the page's own 2207 changelog corrects to the values the generated `Gametype` enum holds.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-player-game-type-packet/
 */
export default class UpdatePlayerGameTypePacket extends DataPacket {
    public static NetID = Identifiers.UpdatePlayerGameTypePacket;

    /** Player Game Type: the game type the target player now has. */
    public playerGameType: Gametype = Gametype.SURVIVAL;

    /** Target player: the unique id of the player whose game type changed. */
    public targetPlayer = 0n;

    /** Tick: the input tick this change belongs to. */
    public tick = 0n;

    /** Reads the game type, the target player, and the tick. */
    public decodePayload(): void {
        this.playerGameType = this.readVarInt();
        this.targetPlayer = this.readVarLong();
        this.tick = this.readUnsignedVarLong();
    }

    /** Writes the game type, the target player, and the tick. */
    public encodePayload(): void {
        this.writeVarInt(this.playerGameType);
        this.writeVarLong(this.targetPlayer);
        this.writeUnsignedVarLong(this.tick);
    }
}
