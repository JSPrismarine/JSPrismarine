/**
 * The `persistence` scenario: the dynamic property members of the world, an entity and an item
 * stack, and the script scoreboard, with what each returns and throws. Properties belong to the
 * pack that set them, so every id here is this pack's. A command and a script share one
 * scoreboard, so a score one writes the other reads. Everything runs once the chunk at the
 * origin has loaded, on the flat world's grass at y -61.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { DisplaySlotId, ItemStack, ObjectiveSortOrder, ScoreboardIdentity, system, world } from '@minecraft/server';

const PACK = 'persistence';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the chunks loaded. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/**
 * A value as the record can hold it: negative zero and the numbers JSON has no form for become
 * strings, and a vector becomes plain data.
 */
const plain = (value) => {
    if (value === undefined) return 'undefined';
    if (typeof value === 'number') {
        if (Object.is(value, -0)) return '-0';
        if (!Number.isFinite(value)) return String(value);
        return value;
    }
    if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) return value.map(plain);
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = plain(value[key]);
        return out;
    }
    return value;
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: plain(call()) });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** The armor stand's id, which differs between servers, so the record names it instead. */
let standId;

/** A participant's display name, with the armor stand's id written as `the stand`. */
const named = (displayName) => (displayName === standId ? 'the stand' : displayName);

/** An identity as plain data. */
const identity = (participant) => ({
    id: participant.id,
    type: participant.type,
    displayName: named(participant.displayName),
    isValid: participant.isValid
});

/** Sets a world property and records the property read back and the byte count after. */
const setAndRead = (owner, label, id, value) => {
    attempt(`${label} set ${id}`, () => owner.setDynamicProperty(id, value));
    attempt(`${label} get ${id}`, () => owner.getDynamicProperty(id));
    attempt(`${label} bytes after ${id}`, () => owner.getDynamicPropertyTotalByteCount());
};

/** The checks every owner of dynamic properties shares: types, deletion, ids and the byte count. */
const properties = (owner, label) => {
    attempt(`${label} ids at first`, () => owner.getDynamicPropertyIds());
    attempt(`${label} bytes at first`, () => owner.getDynamicPropertyTotalByteCount());
    attempt(`${label} get a missing id`, () => owner.getDynamicProperty('jsp:missing'));
    setAndRead(owner, label, 'jsp:a', 1);
    setAndRead(owner, label, 'jsp:a', true);
    setAndRead(owner, label, 'jsp:a', false);
    setAndRead(owner, label, 'jsp:a', 'xyz');
    setAndRead(owner, label, 'jsp:a', '');
    setAndRead(owner, label, 'jsp:a', 'é');
    setAndRead(owner, label, 'jsp:a', { x: 1, y: 2, z: 3 });
    setAndRead(owner, label, 'jsp:bb', 1.5);
    setAndRead(owner, label, 'jsp:neg0', -0);
    setAndRead(owner, label, 'jsp:big', 2 ** 53 + 1);
    setAndRead(owner, label, 'jsp:float', { x: 0.1, y: -2.5, z: 16777217 });
    setAndRead(owner, label, 'plain', 4);
    setAndRead(owner, label, '', 5);
    attempt(`${label} set NaN`, () => owner.setDynamicProperty('jsp:nan', Number.NaN));
    attempt(`${label} set Infinity`, () => owner.setDynamicProperty('jsp:inf', Number.POSITIVE_INFINITY));
    attempt(`${label} set an infinite vector`, () => owner.setDynamicProperty('jsp:vinf', { x: 0, y: 1e40, z: 0 }));
    attempt(`${label} get an infinite vector`, () => owner.getDynamicProperty('jsp:vinf'));
    attempt(`${label} set a bigint`, () => owner.setDynamicProperty('jsp:bigint', 5n));
    attempt(`${label} set an object`, () => owner.setDynamicProperty('jsp:object', { a: 1 }));
    attempt(`${label} set an array`, () => owner.setDynamicProperty('jsp:array', [1, 2, 3]));
    attempt(`${label} set null`, () => owner.setDynamicProperty('jsp:null', null));
    attempt(`${label} set a number id`, () => owner.setDynamicProperty(5, 1));
    attempt(`${label} set 32767 characters`, () => owner.setDynamicProperty('jsp:long', 'a'.repeat(32767)));
    attempt(`${label} length of 32767 characters`, () => owner.getDynamicProperty('jsp:long').length);
    attempt(`${label} set 32768 characters`, () => owner.setDynamicProperty('jsp:longer', 'a'.repeat(32768)));
    attempt(`${label} get 32768 characters`, () => owner.getDynamicProperty('jsp:longer'));
    attempt(`${label} set 20000 two-byte characters`, () => owner.setDynamicProperty('jsp:wide', 'é'.repeat(20000)));
    attempt(`${label} get 20000 two-byte characters`, () => owner.getDynamicProperty('jsp:wide')?.length);
    attempt(`${label} set a 300 character id`, () => owner.setDynamicProperty(`jsp:${'k'.repeat(296)}`, 1));
    attempt(`${label} ids`, () =>
        owner
            .getDynamicPropertyIds()
            .map((id) => (id.length > 40 ? `${id.length} characters` : id))
            .sort()
    );
    attempt(`${label} bytes`, () => owner.getDynamicPropertyTotalByteCount());
    attempt(`${label} delete with undefined`, () => owner.setDynamicProperty('jsp:bb', undefined));
    attempt(`${label} delete with no value`, () => owner.setDynamicProperty('jsp:a'));
    attempt(`${label} get after the delete`, () =>
        [owner.getDynamicProperty('jsp:bb'), owner.getDynamicProperty('jsp:a')].map(plain)
    );
    attempt(`${label} delete a missing id`, () => owner.setDynamicProperty('jsp:missing', undefined));
    attempt(`${label} setDynamicProperties`, () =>
        owner.setDynamicProperties({ 'jsp:m1': 1, 'jsp:m2': 'two', 'jsp:m3': { x: 1, y: 1, z: 1 } })
    );
    attempt(`${label} get after setDynamicProperties`, () =>
        ['jsp:m1', 'jsp:m2', 'jsp:m3'].map((id) => plain(owner.getDynamicProperty(id)))
    );
    attempt(`${label} setDynamicProperties with a bad value`, () =>
        owner.setDynamicProperties({ 'jsp:m4': 4, 'jsp:m5': { a: 1 } })
    );
    attempt(`${label} get after the bad setDynamicProperties`, () => plain(owner.getDynamicProperty('jsp:m4')));
    attempt(`${label} clear`, () => owner.clearDynamicProperties());
    attempt(`${label} ids after clear`, () => owner.getDynamicPropertyIds());
    attempt(`${label} bytes after clear`, () => owner.getDynamicPropertyTotalByteCount());
};

/** Runs `run` once the chunk at the origin is loaded, as the `entities` scenario does. */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one, as JSPrismarine's does, may refuse it.
        }
        const waiting = system.runInterval(() => {
            let loaded = false;
            try {
                loaded = overworld.getBlock({ x: 0, y: -61, z: 0 }) !== undefined;
            } catch {
                // Not loaded yet.
            }
            if (!loaded) return;
            system.clearRun(waiting);
            start = system.currentTick;
            run();
        }, 1);
    });
};

const scoreboard = (stand) => {
    const board = world.scoreboard;
    const overworld = world.getDimension('overworld');
    attempt('scoreboard is the same object', () => world.scoreboard === board);
    attempt('getObjectives at first', () => board.getObjectives().length);
    attempt('getParticipants at first', () => board.getParticipants().length);
    attempt('getObjective a missing id', () => board.getObjective('jspnone'));
    attempt('addObjective', () => {
        const objective = board.addObjective('jspone');
        return { id: objective.id, displayName: objective.displayName, isValid: objective.isValid };
    });
    attempt('addObjective with a display name', () => board.addObjective('jsptwo', 'Two').displayName);
    attempt('addObjective again', () => board.addObjective('jspone').id);
    attempt('addObjective an empty id', () => board.addObjective('').id);
    attempt('getObjective is the same object', () => board.getObjective('jspone') === board.getObjective('jspone'));
    attempt('getObjectives', () =>
        board
            .getObjectives()
            .map((objective) => objective.id)
            .sort()
    );
    const one = board.getObjective('jspone');
    attempt('getScore of nobody', () => one.getScore('nobody'));
    attempt('hasParticipant nobody', () => one.hasParticipant('nobody'));
    attempt('setScore', () => one.setScore('fake', 5));
    attempt('getScore', () => one.getScore('fake'));
    attempt('addScore', () => one.addScore('fake', 3));
    attempt('addScore a new participant', () => one.addScore('fresh', 2));
    attempt('setScore a fraction', () => {
        one.setScore('fraction', 1.75);
        return one.getScore('fraction');
    });
    attempt('setScore past int32', () => one.setScore('huge', 2 ** 31));
    attempt('setScore the int32 minimum', () => {
        one.setScore('low', -(2 ** 31));
        return one.getScore('low');
    });
    attempt('addScore past int32', () => {
        one.setScore('edge', 2 ** 31 - 1);
        return one.addScore('edge', 1);
    });
    attempt('setScore an empty name', () => one.setScore('', 1));
    attempt('setScore an entity', () => one.setScore(stand, 9));
    attempt('getScore an entity', () => one.getScore(stand));
    attempt('entity scoreboardIdentity', () => {
        const found = stand.scoreboardIdentity;
        return found === undefined ? 'undefined' : { ...identity(found), entityMatches: found.getEntity() === stand };
    });
    attempt('scoreboardIdentity is the same object', () => stand.scoreboardIdentity === stand.scoreboardIdentity);
    attempt('getParticipants', () =>
        one
            .getParticipants()
            .map(identity)
            .sort((a, b) => a.id - b.id)
    );
    attempt('a participant is a ScoreboardIdentity', () => one.getParticipants()[0] instanceof ScoreboardIdentity);
    attempt('getScores', () =>
        one
            .getScores()
            .map(({ participant, score }) => ({
                participant: named(participant.displayName),
                type: participant.type,
                score
            }))
            .sort((a, b) => (a.participant < b.participant ? -1 : 1))
    );
    attempt('fake player getEntity', () =>
        one
            .getParticipants()
            .find((p) => p.displayName === 'fake')
            .getEntity()
    );
    attempt('getScore by identity', () => one.getScore(one.getParticipants().find((p) => p.displayName === 'fake')));
    attempt('hasParticipant fake', () => one.hasParticipant('fake'));
    attempt('board getParticipants', () =>
        board
            .getParticipants()
            .map((p) => named(p.displayName))
            .sort()
    );
    attempt(
        'a command reads a script score',
        () => overworld.runCommand('execute if score fake jspone matches 8 run say eight').successCount
    );
    attempt(
        'a command writes a score',
        () => overworld.runCommand('scoreboard players set cmd jspone 12').successCount
    );
    attempt('the script reads the command score', () => one.getScore('cmd'));
    attempt(
        'a command adds an objective',
        () => overworld.runCommand('scoreboard objectives add jspcmd dummy Command').successCount
    );
    attempt('the script sees the command objective', () => board.getObjective('jspcmd')?.displayName);
    attempt('removeParticipant', () => one.removeParticipant('fake'));
    attempt('removeParticipant again', () => one.removeParticipant('fake'));
    attempt('removeParticipant an entity', () => one.removeParticipant(stand));
    attempt('board participants after removal', () =>
        board
            .getParticipants()
            .map((p) => named(p.displayName))
            .sort()
    );
    attempt('getObjectiveAtDisplaySlot empty', () => board.getObjectiveAtDisplaySlot(DisplaySlotId.Sidebar));
    attempt('setObjectiveAtDisplaySlot', () =>
        board.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
            objective: one,
            sortOrder: ObjectiveSortOrder.Ascending
        })
    );
    attempt('getObjectiveAtDisplaySlot', () => {
        const shown = board.getObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
        return { objective: shown.objective.id, sortOrder: shown.sortOrder, same: shown.objective === one };
    });
    attempt(
        'setObjectiveAtDisplaySlot over another',
        () => board.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: board.getObjective('jsptwo') })?.id
    );
    attempt(
        'getObjectiveAtDisplaySlot default sort',
        () => board.getObjectiveAtDisplaySlot(DisplaySlotId.Sidebar).sortOrder
    );
    attempt('setObjectiveAtDisplaySlot List', () =>
        board.setObjectiveAtDisplaySlot(DisplaySlotId.List, {
            objective: one,
            sortOrder: ObjectiveSortOrder.Descending
        })
    );
    attempt('clearObjectiveAtDisplaySlot', () => board.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar)?.id);
    attempt('clearObjectiveAtDisplaySlot empty', () => board.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar));
    attempt('removeObjective by id', () => board.removeObjective('jsptwo'));
    attempt('removeObjective a missing id', () => board.removeObjective('jsptwo'));
    attempt('removeObjective by object', () => board.removeObjective(one));
    attempt('a removed objective isValid', () => one.isValid);
    attempt('a removed objective getScore', () => one.getScore('cmd'));
    attempt('a removed objective setScore', () => one.setScore('cmd', 1));
    attempt('a removed objective id', () => one.id);
    attempt('the List slot after its objective went', () => board.getObjectiveAtDisplaySlot(DisplaySlotId.List));
    attempt('getObjectives at the end', () =>
        board
            .getObjectives()
            .map((objective) => objective.id)
            .sort()
    );
};

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    properties(world, 'world');
    const stand = overworld.spawnEntity('minecraft:armor_stand', { x: 0.5, y: -60, z: 0.5 });
    standId = stand.id;
    properties(stand, 'entity');
    const sword = new ItemStack('minecraft:diamond_sword', 1);
    properties(sword, 'item');
    const apple = new ItemStack('minecraft:apple', 2);
    attempt('stackable item set', () => apple.setDynamicProperty('jsp:a', 1));
    attempt('stackable item get', () => apple.getDynamicProperty('jsp:a'));
    attempt('stackable item ids', () => apple.getDynamicPropertyIds());
    attempt('stackable item bytes', () => apple.getDynamicPropertyTotalByteCount());
    attempt('stackable item clear', () => apple.clearDynamicProperties());
    const single = new ItemStack('minecraft:apple', 1);
    attempt('a single stackable item set', () => single.setDynamicProperty('jsp:a', 1));
    attempt('a new item keeps what it was set', () => {
        const kept = new ItemStack('minecraft:diamond_sword', 1);
        kept.setDynamicProperty('jsp:kept', 'yes');
        return kept.getDynamicProperty('jsp:kept');
    });
    scoreboard(stand);
    stand.setDynamicProperty('jsp:dead', 1);
    stand.kill();
    attempt('a killed entity get', () => stand.getDynamicProperty('jsp:dead'));
    attempt('a killed entity set', () => stand.setDynamicProperty('jsp:dead', 2));
    attempt('a killed entity ids', () => stand.getDynamicPropertyIds());
    attempt('a killed entity scoreboardIdentity', () => stand.scoreboardIdentity);
    record('done');
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
