/**
 * The generation host: a process that owns a {@link GenerationPool} and answers the server over
 * an IPC channel.
 *
 * Started by {@link HostedGenerationPool} with `child_process.fork`. The host builds its pool
 * from the options in its first message, runs each task it is sent, and posts the result back.
 * It exits when the channel closes, so a server that dies does not leave one behind, and it
 * ignores SIGINT and SIGTERM, because the terminal sends Ctrl+C to the whole process group and
 * the server decides when generation stops.
 */
import { GenerationPool } from './GenerationPool';
import type { GenerationPriority, GenerationTask } from './GenerationPool';
import type { HostCommand, HostEvent, HostPoolOptions } from './hostProtocol';
import { decodeShared } from './hostProtocol';
import { decodeReusable, REUSABLE_CAPACITY, ReusableCache } from './reusableInput';
import type { ReusableSlot } from './reusableInput';
import { ChunkgenErrors } from '@jsprismarine/errors/chunkgen';
import { asError } from '@jsprismarine/errors/common';

const send = (event: HostEvent): void => {
    process.send?.(event);
};

let pool: GenerationPool | undefined;
const taskIds = new WeakMap<GenerationTask, number>();
/** The reusable inputs the server sent, which later tasks name by key. */
const kept = new ReusableCache<unknown>(REUSABLE_CAPACITY);

const start = (options: HostPoolOptions): void => {
    // The setup arrives as plain bytes and goes back into shared memory here, so the host's own
    // workers share it the way the server's would have.
    pool = new GenerationPool({
        ...options,
        ...(options.setup === undefined ? {} : { setup: decodeShared(options.setup) })
    });
    send({ type: 'ready' });
};

const run = (
    id: number,
    sent: GenerationTask,
    priority: GenerationPriority,
    reusable: readonly ReusableSlot[] | undefined
): void => {
    const current = pool;
    if (current === undefined) {
        const { name, message } = new ChunkgenErrors.GenerationHostHasNoPool();
        send({ type: 'result', id, ok: false, error: { name, message } });
        return;
    }

    // Decoded as it arrives, before anything can be canceled, so the values kept are the ones the
    // server's record says were sent, in the order it sent them.
    let task = sent;
    if (reusable !== undefined) {
        try {
            task = { ...sent, input: decodeReusable(sent.input, reusable, kept) };
        } catch (error) {
            const thrown = asError(error);
            send({ type: 'result', id, ok: false, error: { name: thrown.name, message: thrown.message } });
            return;
        }
    }

    taskIds.set(task, id);
    current.run(task, priority).then(
        (result) => {
            send({
                type: 'result',
                id,
                ok: true,
                result: {
                    payload: result.payload,
                    transferList: result.transferList,
                    ...(result.workerStats === undefined ? {} : { workerStats: result.workerStats })
                }
            });
        },
        (error: unknown) => {
            const thrown = asError(error);
            send({
                type: 'result',
                id,
                ok: false,
                error: {
                    name: thrown.name,
                    message: thrown.message,
                    ...(thrown.stack === undefined ? {} : { stack: thrown.stack })
                }
            });
        }
    );
};

process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});
process.on('disconnect', () => process.exit(0));
process.on('message', (command: HostCommand) => {
    switch (command.type) {
        case 'init':
            start(command.options);
            break;
        case 'run':
            run(command.id, command.task, command.priority, command.reusable);
            break;
        case 'cancel': {
            const ids = new Set(command.ids);
            pool?.cancel((task) => !ids.has(taskIds.get(task) ?? -1));
            break;
        }
        case 'promote': {
            const ids = new Set(command.ids);
            pool?.promote((task) => ids.has(taskIds.get(task) ?? -1), command.to);
            break;
        }
        case 'limit':
            pool?.setBackgroundLimit(command.limit);
            break;
        case 'destroy':
            void (pool?.destroy() ?? Promise.resolve()).then(() => process.exit(0));
            break;
    }
});
