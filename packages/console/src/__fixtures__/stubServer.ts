// Forked by `startConsole.scenarios.test.ts` to run a stub server in its own process, so the
// console's messages cross a real IPC channel. Node runs it with its built-in type stripping;
// `tsconfig.json` excludes this directory for that reason. The first argument is a JSON
// `{ options, script }`: the stub's answers and the messages it plays once it starts.
import type { ConsoleMessage, MessageLink, ServerMessage } from '@jsprismarine/console-protocol';
import type { ScriptStep, StubServerOptions } from '../testing/stubServer.test-utils.ts';
import { StubServer } from '../testing/stubServer.test-utils.ts';

// The argument is this test's own JSON; nothing else starts this file.
const { options, script } = JSON.parse(process.argv[2] ?? '{}') as {
    options?: StubServerOptions;
    script?: ScriptStep[];
};

/** Settles once every message sent so far has left the process. */
let sent: Promise<void> = Promise.resolve();

const link: MessageLink<ConsoleMessage, ServerMessage> = {
    send(message) {
        if (process.send === undefined) return false;
        sent = new Promise((resolve) => process.send?.(message, () => resolve()));
        return true;
    },
    onMessage(listener) {
        // The console's messages; a malformed one is the test's bug and fails it loudly.
        const onMessage = (message: unknown): void => listener(message as ConsoleMessage);
        process.on('message', onMessage);
        return () => {
            process.off('message', onMessage);
        };
    },
    onClose(listener) {
        process.on('disconnect', listener);
        return () => {
            process.off('disconnect', listener);
        };
    },
    close() {
        // Exits once the queued messages are out, as a server's `disable` waits for them.
        void sent.then(() => process.exit(0));
    }
};

process.on('disconnect', () => process.exit(3));

void new StubServer(link, options).play(script ?? []);
