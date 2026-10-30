import { Gametype } from '@jsprismarine/minecraft';
import { layoutAt, updatePlayerGameTypePacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

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
export default class UpdatePlayerGameTypePacket extends FieldNetworkPacket {
    /** Player Game Type: the game type the target player now has. */
    public playerGameType: Gametype = Gametype.SURVIVAL;

    /** Target player: the unique id of the player whose game type changed. */
    public targetPlayer = 0n;

    /** Tick: the input tick this change belongs to. */
    public tick = 0n;

    /** Reads the game type, the target player, and the tick. */
    public decodePayload(): void {
        const read = layoutAt(updatePlayerGameTypePacket, this.codecProtocol).decode(this);
        this.playerGameType = read.playerGameType;
        this.targetPlayer = read.targetPlayer;
        this.tick = read.tick;
    }

    /** Writes the game type, the target player, and the tick. */
    public encodePayload(): void {
        layoutAt(updatePlayerGameTypePacket, this.codecProtocol).encode(this, {
            playerGameType: this.playerGameType,
            targetPlayer: this.targetPlayer,
            tick: this.tick
        });
    }
}
