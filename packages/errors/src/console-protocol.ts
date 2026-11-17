import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/console-protocol` throws. */
export const ConsoleProtocolErrors = defineErrors('console-protocol', {
    /**
     * The console link was started in a process with no IPC channel to its parent. Start the server
     * with `child_process.fork`, or give `spawn` an `ipc` stdio entry.
     */
    NoIpcChannel:
        'childProcessLink needs an IPC channel; start the process with child_process.fork or a stdio entry of "ipc".'
});
