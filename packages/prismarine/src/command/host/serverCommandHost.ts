/**
 * The server's implementation of `CommandHost` from `@jsprismarine/commands`.
 *
 * The command layer holds no world state: a command there is a Brigadier tree
 * plus calls into this interface. Everything the server can actually do is in
 * {@link entityCommandHost}, {@link worldCommandHost} and
 * {@link serverSideCommandHost}; the two groups below have no subsystem behind
 * them at all and say so rather than answering falsely.
 */
import type { CommandHost, DataCommandHost, ScoreboardCommandHost } from '@jsprismarine/commands';

import type Server from '../../Server';
import { entityCommandHost } from './entities';
import { setItemSlot } from './inventory';
import { serverSideCommandHost } from './server';
import { unsupported } from './support';
import { worldCommandHost } from './world';

/**
 * The scoreboard group, which this server has none of.
 *
 * `SetScorePacket`, `SetDisplayObjectivePacket` and `RemoveObjectivePacket`
 * exist as wire types and nothing holds an objective or a score, so every
 * verb refuses. `/scoreboard` is therefore never advertised, and the only way
 * to reach one of these is `execute if score`, which reports the refusal to
 * the player rather than quietly failing the condition.
 */
const scoreboardCommandHost = (): ScoreboardCommandHost => {
    const refuse = () => unsupported('scoreboard');
    return {
        addObjective: refuse,
        removeObjective: refuse,
        listObjectives: refuse,
        setDisplay: refuse,
        getScore: refuse,
        setScore: refuse,
        addScore: refuse,
        resetScore: refuse,
        listScores: refuse,
        operation: refuse,
        enableTrigger: refuse
    };
};

/**
 * The NBT, loot, predicate and function group.
 *
 * The function verbs run `@jsprismarine/mcfunction` over whatever the loaded
 * datapacks declared; `setSlot` writes a named inventory slot, which is all
 * `/replaceitem` needs. What still refuses is NBT by path, which nothing
 * reads or writes, item modifiers, which need the same, and the predicate
 * evaluator.
 */
const dataCommandHost = (server: Server): DataCommandHost => {
    const refuse = () => unsupported('reading and writing NBT by path');
    const functions = () => server.getCommandManager().getFunctionRuntime();

    return {
        getData: refuse,
        countData: refuse,
        mergeData: refuse,
        modifyData: refuse,
        removeData: refuse,
        applyItemModifier: refuse,
        setSlot: (target, slot, item, count, mode) => setItemSlot(server, target, slot, item, count, mode),
        copySlots: refuse,
        runLootTable: () => unsupported('loot table runtime'),
        testPredicate: () => unsupported('datapack predicate evaluator'),
        runFunction: (name, source, nbt) => functions().run(name, source, nbt),
        schedule: (name, delayTicks, mode) => functions().queue(name, delayTicks, mode),
        clearSchedule: (name) => functions().clearQueue(name),
        randomValue: () => unsupported('named random sequences'),
        resetRandomSequence: () => unsupported('named random sequences')
    };
};

/**
 * Builds the host the vanilla command set runs against.
 *
 * @param server - The live server. Held rather than snapshotted: a command
 *   runs long after the host was built and has to see the world as it is then.
 */
export const serverCommandHost = (server: Server): CommandHost => ({
    entities: entityCommandHost(server),
    world: worldCommandHost(server),
    scoreboard: scoreboardCommandHost(),
    data: dataCommandHost(server),
    server: serverSideCommandHost(server)
});
