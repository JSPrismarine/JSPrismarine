/**
 * The LevelDB record `scoreboard`, in the form the pinned Bedrock Dedicated Server (BDS) writes:
 * one little-endian NBT compound.
 *
 * ```text
 * Criteria          TAG_List, empty
 * DisplayObjectives TAG_List of { Name: slot, ObjectiveName, SortOrder: TAG_Byte 0 ascending, 1 descending }
 * Entries           TAG_List of { IdentityType: TAG_Byte, ScoreboardId: TAG_Long } with
 *                   FakePlayerName (3), EntityID (2) or PlayerId (1)
 * LastUniqueID      TAG_Long
 * Objectives        TAG_List of { Criteria, DisplayName, Name, Scores: TAG_List of { Score: TAG_Int, ScoreboardId } }
 * ```
 *
 * BDS writes each list newest first and the display slots in byte order, and so does this.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import type { Participant, ParticipantType, SavedScoreboard } from '../../Scoreboard';

/** BDS's `IdentityType` byte for each participant type. */
const IDENTITY_TYPES: Readonly<Record<ParticipantType, number>> = { Player: 1, Entity: 2, FakePlayer: 3 };

const compound = (entries: readonly (readonly [string, unknown])[]): NBTTagCompound => {
    const tag = new NBTTagCompound('');
    for (const [name, value] of entries) tag.addValue(name, value);
    return tag;
};

const entryOf = (participant: Participant): NBTTagCompound => {
    const id = new Types.LongVal(BigInt(participant.id));
    const type = new Types.ByteVal(IDENTITY_TYPES[participant.type]);
    if (participant.type === 'FakePlayer') {
        return compound([
            ['FakePlayerName', new Types.StringVal(participant.name)],
            ['IdentityType', type],
            ['ScoreboardId', id]
        ]);
    }
    const saved = new Types.LongVal(participant.saved ?? 0n);
    return participant.type === 'Entity'
        ? compound([
              ['EntityID', saved],
              ['IdentityType', type],
              ['ScoreboardId', id]
          ])
        : compound([
              ['IdentityType', type],
              ['PlayerId', saved],
              ['ScoreboardId', id]
          ]);
};

/** Writes a scoreboard as BDS writes it. */
export const scoreboardToNbt = (saved: SavedScoreboard): NBTTagCompound => {
    const displays = [...saved.displays].sort((a, b) => Buffer.compare(Buffer.from(a.slot), Buffer.from(b.slot)));
    return compound([
        ['Criteria', new Set()],
        [
            'DisplayObjectives',
            new Set(
                displays.map((display) =>
                    compound([
                        ['Name', new Types.StringVal(display.slot)],
                        ['ObjectiveName', new Types.StringVal(display.objective)],
                        ['SortOrder', new Types.ByteVal(display.sortOrder === 'descending' ? 1 : 0)]
                    ])
                )
            )
        ],
        ['Entries', new Set([...saved.participants].reverse().map(entryOf))],
        ['LastUniqueID', new Types.LongVal(BigInt(saved.lastId))],
        [
            'Objectives',
            new Set(
                [...saved.objectives].reverse().map((objective) =>
                    compound([
                        ['Criteria', new Types.StringVal(objective.criterion)],
                        ['DisplayName', new Types.StringVal(objective.displayName)],
                        ['Name', new Types.StringVal(objective.name)],
                        [
                            'Scores',
                            new Set(
                                [...objective.scores].reverse().map(({ participant, score }) =>
                                    compound([
                                        ['Score', new Types.NumberVal(score)],
                                        ['ScoreboardId', new Types.LongVal(BigInt(participant))]
                                    ])
                                )
                            )
                        ]
                    ])
                )
            )
        ]
    ]);
};

/** The compounds of a list tag, skipping anything else. */
const compoundsIn = (root: NBTTagCompound, name: string): NBTTagCompound[] => {
    const list: unknown = root.getList(name, false);
    return list instanceof Set ? [...list].filter((each) => each instanceof NBTTagCompound) : [];
};

const participantOf = (entry: NBTTagCompound): Participant | undefined => {
    const id = Number(entry.getLong('ScoreboardId', -1n));
    if (id < 0) return undefined;
    switch (entry.getByte('IdentityType', 0)) {
        case IDENTITY_TYPES.FakePlayer:
            return { id, type: 'FakePlayer', name: entry.getString('FakePlayerName', '') };
        case IDENTITY_TYPES.Entity: {
            const saved = entry.getLong('EntityID', 0n);
            // An entity's display name is its id, which is its saved id until it loads.
            return { id, type: 'Entity', name: String(saved), saved };
        }
        case IDENTITY_TYPES.Player:
            return { id, type: 'Player', name: '', saved: entry.getLong('PlayerId', 0n) };
        default:
            return undefined;
    }
};

/** Reads a scoreboard BDS or this server wrote, oldest first, skipping entries it cannot read. */
export const scoreboardFromNbt = (root: NBTTagCompound): SavedScoreboard => {
    const participants = compoundsIn(root, 'Entries')
        .map(participantOf)
        .filter((participant) => participant !== undefined)
        .sort((a, b) => a.id - b.id);
    const objectives = compoundsIn(root, 'Objectives')
        .reverse()
        .map((objective) => ({
            name: objective.getString('Name', ''),
            criterion: objective.getString('Criteria', 'dummy'),
            displayName: objective.getString('DisplayName', objective.getString('Name', '')),
            scores: compoundsIn(objective, 'Scores')
                .reverse()
                .map((score) => ({
                    participant: Number(score.getLong('ScoreboardId', -1n)),
                    score: score.getNumber('Score', 0)
                }))
        }));
    const displays = compoundsIn(root, 'DisplayObjectives').map((display) => ({
        slot: display.getString('Name', ''),
        objective: display.getString('ObjectiveName', ''),
        sortOrder: display.getByte('SortOrder', 1) === 0 ? ('ascending' as const) : ('descending' as const)
    }));
    return { objectives, participants, displays, lastId: Number(root.getLong('LastUniqueID', 0n)) };
};
