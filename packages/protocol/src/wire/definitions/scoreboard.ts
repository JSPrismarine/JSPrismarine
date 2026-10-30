/**
 * The scoreboard packets: registering an objective, filling it with lines, and taking it away.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

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
 * `Score Info`: one entry, under whichever of the four alternatives its selector names.
 *
 * Which fields travel is decided by the entry's own action, not by the protocol version, so
 * the branch lives in this wire type's reader and writer rather than in a gate.
 */
export const scorePacketEntry: WireType<ScorePacketEntry> = t.custom(
    'ScoreInfo',
    (stream, entry) => {
        t.varuint32.write(stream, entry.action);
        t.string.write(stream, ACTION_NAMES[entry.action]);
        t.varint64.write(stream, entry.scoreboardId);

        if (entry.action === ScorePacketEntryAction.Remove) {
            if (entry.objectiveName === undefined) {
                t.bool.write(stream, false);
            } else {
                t.bool.write(stream, true);
                t.string.write(stream, entry.objectiveName);
            }

            return;
        }

        t.string.write(stream, entry.objectiveName);
        t.li32.write(stream, entry.scoreValue);

        switch (entry.action) {
            case ScorePacketEntryAction.ChangePlayer:
                t.varint64.write(stream, entry.playerUniqueId);
                break;
            case ScorePacketEntryAction.ChangeEntity:
                t.varint64.write(stream, entry.actorId);
                break;
            case ScorePacketEntryAction.ChangeFakePlayer:
                t.string.write(stream, entry.fakePlayerName);
                break;
        }
    },
    (stream) => {
        const action = t.varuint32.read(stream);
        if (!isScorePacketEntryAction(action)) throw new Error(`Unknown set score alternative ${action}`);

        t.string.read(stream);
        const scoreboardId = t.varint64.read(stream);

        if (action === ScorePacketEntryAction.Remove) {
            const entry: ScorePacketEntry = { action, scoreboardId };
            if (t.bool.read(stream)) entry.objectiveName = t.string.read(stream);
            return entry;
        }

        const objectiveName = t.string.read(stream);
        const scoreValue = t.li32.read(stream);

        switch (action) {
            case ScorePacketEntryAction.ChangePlayer:
                return { action, scoreboardId, objectiveName, scoreValue, playerUniqueId: t.varint64.read(stream) };
            case ScorePacketEntryAction.ChangeEntity:
                return { action, scoreboardId, objectiveName, scoreValue, actorId: t.varint64.read(stream) };
            case ScorePacketEntryAction.ChangeFakePlayer:
                return { action, scoreboardId, objectiveName, scoreValue, fakePlayerName: t.string.read(stream) };
        }
    }
);

/**
 * The `SetScorePacket` field list.
 *
 * The docs mark `Score Info` itself optional at 2193 and record it losing that marking at 2207.
 * No presence byte travels here: gophertunnel at 2193 writes the bare count, and a presence
 * byte would push every entry one byte out.
 */
export const setScorePacket = definePacket('SetScorePacket', {
    /** `Score Info`: the lines to add, change or remove. */
    entries: t.list(scorePacketEntry)
});

/** What `SetScorePacket` carries. */
export type SetScorePayload = PayloadOf<typeof setScorePacket>;

/**
 * The `SetDisplayObjectivePacket` field list.
 *
 * The slot names vanilla uses are `list`, `sidebar` and `belowname`, and the criteria name is
 * always `dummy`: the client tracks no criteria itself.
 */
export const setDisplayObjectivePacket = definePacket('SetDisplayObjectivePacket', {
    /** `DisplaySlotName`: where the objective is shown. */
    displaySlotName: t.string,
    /** `ObjectiveName`: what `SetScorePacket` entries refer to the objective by. */
    objectiveName: t.string,
    /** `ObjectiveDisplayName`: the title shown above the objective. */
    objectiveDisplayName: t.string,
    /** `CriteriaName`. */
    criteriaName: t.string,
    /** `SortOrder`: an `ObjectiveSortOrder`. */
    sortOrder: t.varint32
});

/** What `SetDisplayObjectivePacket` carries. */
export type SetDisplayObjectivePayload = PayloadOf<typeof setDisplayObjectivePacket>;

/**
 * The `RemoveObjectivePacket` field list.
 *
 * The client drops the objective and every score filed under it, so this undoes a
 * `SetDisplayObjectivePacket` and the `SetScorePacket` entries that followed it.
 */
export const removeObjectivePacket = definePacket('RemoveObjectivePacket', {
    /** `Objective Name`: what the objective was registered under. */
    objectiveName: t.string
});

/** What `RemoveObjectivePacket` carries. */
export type RemoveObjectivePayload = PayloadOf<typeof removeObjectivePacket>;

/** One scoreboard entry and the player it stands for. */
export interface ScoreboardIdentityPacketInfo {
    /** `Scoreboard Id`: the same id `SetScorePacket` files scores under. */
    scoreboardId: bigint;

    /** `Player Unique Id`: present on `Update`, absent on `Remove`. */
    playerUniqueId?: bigint;
}

/**
 * `Scoreboard Identity Info`: one entry, with its player id behind a presence byte.
 *
 * Whether the player id travels is decided per entry by that byte, not by the packet type and
 * not by the protocol version, so the branch lives in this wire type rather than in a gate.
 * Mojang's Cereal conversion note for the packet says the same. Before protocol 2193 the id
 * was written only when the packet type was `Update`, so a reader keyed on the type is one
 * byte off on every entry.
 */
export const scoreboardIdentityInfo: WireType<ScoreboardIdentityPacketInfo> = t.custom(
    'ScoreboardIdentityInfo',
    (stream, entry) => {
        t.varint64.write(stream, entry.scoreboardId);

        if (entry.playerUniqueId === undefined) {
            t.bool.write(stream, false);
        } else {
            t.bool.write(stream, true);
            t.varint64.write(stream, entry.playerUniqueId);
        }
    },
    (stream) => {
        const entry: ScoreboardIdentityPacketInfo = { scoreboardId: t.varint64.read(stream) };
        if (t.bool.read(stream)) entry.playerUniqueId = t.varint64.read(stream);
        return entry;
    }
);

/**
 * The `SetScoreboardIdentityPacket` field list.
 *
 * An entry with an identity takes its display name from the player it points at, so the name
 * follows a rename. A player leaving is handled by clearing the identity, which leaves the
 * line showing whatever text it was last given.
 */
export const setScoreboardIdentityPacket = definePacket('SetScoreboardIdentityPacket', {
    /** `Scoreboard Identity Packet Type`: a `ScoreboardIdentityPacketType`. */
    type: t.uint8,
    /** `Scoreboard Identity Info`: the entries whose identity is being set or cleared. */
    entries: t.list(scoreboardIdentityInfo)
});

/** What `SetScoreboardIdentityPacket` carries. */
export type SetScoreboardIdentityPayload = PayloadOf<typeof setScoreboardIdentityPacket>;
