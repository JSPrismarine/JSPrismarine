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
import { copyItemSlots, setItemSlot } from './inventory';
import { runLootCommand } from './loot';
import { nbtDataVerbs } from './nbtData';
import { RandomSequences } from './randomSequences';
import { scoreboardCommandHost } from './scoreboard';
import { serverSideCommandHost } from './server';
import { unsupported } from './support';
import { worldCommandHost } from './world';

/**
 * The NBT, loot, predicate and function group.
 *
 * The NBT verbs read and write the default level's command storage (see `./nbtData`). The
 * function verbs run `@jsprismarine/mcfunction` over whatever the loaded datapacks declared. The
 * slot verbs write named slots on players, mobs and container blocks (see `./inventory`). What
 * still refuses is NBT for blocks and entities, item modifiers, and the predicate evaluator.
 */
const dataCommandHost = (server: Server, sequences: RandomSequences): DataCommandHost => {
    const functions = () => server.getCommandManager().getFunctionRuntime();
    // The default level's, as the scoreboard is; read per call, since the host is built before the
    // worlds load.
    const storage = () => server.getWorldManager().getDefaultLevel().getCommandStorage();

    return {
        ...nbtDataVerbs(storage),
        applyItemModifier: () => unsupported('item modifiers for /item'),
        setSlot: (targets, slot, item, count, mode) => setItemSlot(server, targets, slot, item, count, mode),
        copySlots: (sources, fromSlot, targets, toSlot, mode, modifier) =>
            copyItemSlots(server, sources, fromSlot, targets, toSlot, mode, modifier),
        runLoot: (loot, commandSource, destination) => runLootCommand(server, loot, commandSource, destination),
        testPredicate: () => unsupported('datapack predicate evaluator'),
        runFunction: (name, source, nbt, stored) => functions().run(name, source, nbt, stored),
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
 * The scoreboard is the default level's, while the command manager owns and passes the
 * random sequences so replay capture can save the same streams this host uses.
 *
 * @param server - The live server. Held rather than snapshotted: a command
 *   runs long after the host was built and has to see the world as it is then.
 * @param onStopRequested - Called when the `stop` command reaches its server host, with the
 *   shutdown it started.
 * @param sequences - The command-owned random streams, shared with replay capture.
 */
export const serverCommandHost = (
    server: Server,
    onStopRequested: (shutdown: Promise<void>) => void = () => {},
    sequences: RandomSequences = new RandomSequences(() => server.getWorldManager().getDefaultWorld().getSeed())
): CommandHost => {
    // The default level's, which the scripts share and its save writes; read per command, since
    // the host is built before the worlds load.
    const scoreboard = () => server.getWorldManager().getDefaultLevel().getScoreboard();

    return {
        entities: entityCommandHost(server, scoreboard),
        world: worldCommandHost(server),
        scoreboard: scoreboardCommandHost(server, scoreboard),
        data: dataCommandHost(server, sequences),
        server: serverSideCommandHost(server, onStopRequested)
    };
};
