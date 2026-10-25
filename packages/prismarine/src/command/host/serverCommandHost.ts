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
 * The NBT, loot, predicate and function group, of which this server has one
 * verb.
 *
 * `setSlot` writes a named inventory slot, which is all `/replaceitem` needs
 * and which this server's inventories can do. Everything else refuses:
 * entities and block entities carry NBT but nothing reads or writes it by
 * path, and there is no loot runtime, no predicate evaluator and no function
 * runtime. `@jsprismarine/mcfunction` is the piece that will fill
 * `runFunction` and `schedule`; it is wired to nothing yet.
 */
const dataCommandHost = (server: Server): DataCommandHost => {
    const refuse = () => unsupported('NBT, loot and function runtime');
    return {
        getData: refuse,
        countData: refuse,
        mergeData: refuse,
        modifyData: refuse,
        removeData: refuse,
        applyItemModifier: refuse,
        setSlot: (target, slot, item, count, mode) => setItemSlot(server, target, slot, item, count, mode),
        copySlots: refuse,
        runLootTable: refuse,
        testPredicate: refuse,
        runFunction: refuse,
        schedule: refuse,
        clearSchedule: refuse,
        randomValue: refuse,
        resetRandomSequence: refuse
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
