import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** Which alternative of the `Score Info` `oneOf` an entry is, as the varuint32 selector numbers it. */
export enum ScorePacketEntryAction {
    Remove = 0,
    ChangePlayer = 1,
    ChangeEntity = 2,
    ChangeFakePlayer = 3
}

/**
 * The `Action` string each alternative writes after the selector.
 *
 * Lower case, matching gophertunnel and the casing `ResourcePackClientResponsePacket` already
 * proved on the wire. Mojang's docs list them as `Remove`, `ChangePlayer`, `ChangeEntity` and
 * `ChangeFakePlayer`. Decoding discards the string, so either casing reads.
 */
const ACTION_NAMES: Record<ScorePacketEntryAction, string> = {
    [ScorePacketEntryAction.Remove]: 'remove',
    [ScorePacketEntryAction.ChangePlayer]: 'changeplayer',
    [ScorePacketEntryAction.ChangeEntity]: 'changeentity',
    [ScorePacketEntryAction.ChangeFakePlayer]: 'changefakeplayer'
};

const isScorePacketEntryAction = (value: number): value is ScorePacketEntryAction => value in ACTION_NAMES;

/** One line of a scoreboard, or the instruction to drop one. */
export type ScorePacketEntry =
    | {
          action: ScorePacketEntryAction.Remove;
          scoreboardId: bigint;
          /** When set, only this objective's score is reset. When absent, every objective's is. */
          objectiveName?: string;
      }
    | {
          action: ScorePacketEntryAction.ChangePlayer;
          scoreboardId: bigint;
          objectiveName: string;
          scoreValue: number;
          playerUniqueId: bigint;
      }
    | {
          action: ScorePacketEntryAction.ChangeEntity;
          scoreboardId: bigint;
          objectiveName: string;
          scoreValue: number;
          actorId: bigint;
      }
    | {
          action: ScorePacketEntryAction.ChangeFakePlayer;
          scoreboardId: bigint;
          objectiveName: string;
          scoreValue: number;
          fakePlayerName: string;
      };

/**
 * Adds, changes or removes lines on a scoreboard the client is already showing.
 *
 * The objective each entry names has to have arrived in a `SetDisplayObjectivePacket` first.
 * Plain text on a scoreboard is written as a `ChangeFakePlayer` entry, since the other
 * alternatives take their display text from the player or actor they point at.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Score Info as a varuint32 count of entries. Each entry is the
 * `oneOf` selector as a varuint32, the Action string, and Scoreboard Id as a ZigZag varint64,
 * then by alternative: `Remove` an optional Objective Name; `ChangePlayer` and `ChangeEntity`
 * Objective Name, Score Value as an int32 LE and the actor id as a ZigZag varint64;
 * `ChangeFakePlayer` Objective Name, Score Value and Fake Player Name.
 *
 * The docs mark Score Info itself optional at 2193 and record it losing that marking at 2207.
 * No presence byte is written here: gophertunnel at 2193 writes the bare count, and a presence
 * byte would push every entry one byte out.
 *
 * Before protocol 2193 the packet opened with a `ScorePacketType` byte and each entry carried an
 * `IdentityDefinitionType` byte after the score. Mojang's Cereal conversion notes retire that
 * layout; a 1.26.51 client reads the per-entry selector described above.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-score-packet/
 */
export default class SetScorePacket extends DataPacket {
    /** The lines to add, change or remove. */
    public entries: ScorePacketEntry[] = [];

    /**
     * Reads every entry, each as its own alternative.
     * @throws when a selector names none of the four alternatives.
     */
    public decodePayload(): void {
        this.entries = [];

        let count = this.readUnsignedVarInt();
        while (count-- > 0) {
            const action = this.readUnsignedVarInt();
            if (!isScorePacketEntryAction(action)) throw new Error(`Unknown set score alternative ${action}`);

            NetworkUtil.readString(this);
            const scoreboardId = this.readVarLong();

            if (action === ScorePacketEntryAction.Remove) {
                const entry: ScorePacketEntry = { action, scoreboardId };
                if (this.readBoolean()) entry.objectiveName = NetworkUtil.readString(this);
                this.entries.push(entry);
                continue;
            }

            const objectiveName = NetworkUtil.readString(this);
            const scoreValue = this.readIntLE();

            switch (action) {
                case ScorePacketEntryAction.ChangePlayer:
                    this.entries.push({
                        action,
                        scoreboardId,
                        objectiveName,
                        scoreValue,
                        playerUniqueId: this.readVarLong()
                    });
                    break;
                case ScorePacketEntryAction.ChangeEntity:
                    this.entries.push({ action, scoreboardId, objectiveName, scoreValue, actorId: this.readVarLong() });
                    break;
                case ScorePacketEntryAction.ChangeFakePlayer:
                    this.entries.push({
                        action,
                        scoreboardId,
                        objectiveName,
                        scoreValue,
                        fakePlayerName: NetworkUtil.readString(this)
                    });
                    break;
            }
        }
    }

    /** Writes every entry, each as its own alternative. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.entries.length);

        for (const entry of this.entries) {
            this.writeUnsignedVarInt(entry.action);
            NetworkUtil.writeString(this, ACTION_NAMES[entry.action]);
            this.writeVarLong(entry.scoreboardId);

            if (entry.action === ScorePacketEntryAction.Remove) {
                if (entry.objectiveName === undefined) {
                    this.writeBoolean(false);
                } else {
                    this.writeBoolean(true);
                    NetworkUtil.writeString(this, entry.objectiveName);
                }

                continue;
            }

            NetworkUtil.writeString(this, entry.objectiveName);
            this.writeIntLE(entry.scoreValue);

            switch (entry.action) {
                case ScorePacketEntryAction.ChangePlayer:
                    this.writeVarLong(entry.playerUniqueId);
                    break;
                case ScorePacketEntryAction.ChangeEntity:
                    this.writeVarLong(entry.actorId);
                    break;
                case ScorePacketEntryAction.ChangeFakePlayer:
                    NetworkUtil.writeString(this, entry.fakePlayerName);
                    break;
            }
        }
    }
}
