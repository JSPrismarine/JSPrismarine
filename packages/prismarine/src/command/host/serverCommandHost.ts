/**
 * The server's implementation of `CommandHost` from `@jsprismarine/commands`.
 *
 * The command layer holds no world state: a command there is a Brigadier tree
 * plus calls into this interface. Each group is built in its own module;
 * {@link import('../vanillaCommands').UNWIRED_COMMANDS} names the commands
 * whose verbs still refuse, so the server never advertises a command whose
 * body cannot do anything.
 */
import type { CommandHost, DataCommandHost } from '@jsprismarine/commands';

import type Server from '../../Server';
import { entityCommandHost } from './entities';
import { setItemSlot } from './inventory';
import { runLootCommand } from './loot';
import { RandomSequences } from './randomSequences';
import { Scoreboard, scoreboardCommandHost } from './scoreboard';
import { serverSideCommandHost } from './server';
import { unsupported } from './support';
import { worldCommandHost } from './world';

/**
 * The NBT, loot, predicate and function group.
 *
 * The function verbs run `@jsprismarine/mcfunction` over whatever the loaded
 * datapacks declared; `setSlot` writes a named inventory slot, which is all
 * `/replaceitem` needs. What still refuses is NBT by path, which nothing
 * reads or writes, item modifiers, which need the same, and the predicate
 * evaluator.
 */
const dataCommandHost = (server: Server, sequences: RandomSequences): DataCommandHost => {
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
        runLoot: (loot, commandSource, destination) => runLootCommand(server, loot, commandSource, destination),
        testPredicate: () => unsupported('datapack predicate evaluator'),
        runFunction: (name, source, nbt) => functions().run(name, source, nbt),
        returnFromFunction: (value) => functions().requestReturn(value),
        schedule: (name, delayTicks, mode) => functions().queue(name, delayTicks, mode),
        clearSchedule: (name) => functions().clearQueue(name),
        randomValue: (min, max, sequence) => sequences.draw(min, max, sequence),
        resetRandomSequence: (sequence, seed) => sequences.reset(sequence, seed)
    };
};

/**
 * Builds the host the vanilla command set runs against.
 *
 * The scoreboard and the random sequences are built here and nowhere else:
 * both are server state that only commands read, so this is the composition
 * root for them as well as for the five groups.
 *
 * @param server - The live server. Held rather than snapshotted: a command
 *   runs long after the host was built and has to see the world as it is then.
 */
export const serverCommandHost = (server: Server): CommandHost => {
    const scoreboard = new Scoreboard();
    const sequences = new RandomSequences(() => server.getWorldManager().getDefaultWorld().getSeed());

    return {
        entities: entityCommandHost(server, scoreboard),
        world: worldCommandHost(server),
        scoreboard: scoreboardCommandHost(server, scoreboard),
        data: dataCommandHost(server, sequences),
        server: serverSideCommandHost(server)
    };
};
