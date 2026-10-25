// Forked by `childProcessLink.test.ts`. Node runs it with its built-in type stripping, so
// relative imports carry the `.ts` extension; `tsconfig.json` excludes this directory for
// that reason. It plays a tiny server: says hello, answers commands, exits on request.
import { childProcessLink } from '../childProcessLink.ts';
import type { ConsoleMessage, ServerMessage } from '../messages.ts';
import { isConsoleMessage } from '../messages.ts';

const link = childProcessLink<ConsoleMessage, ServerMessage>({ validate: isConsoleMessage });

link.onClose(() => {
    process.exit(3);
});

link.onMessage((message) => {
    if (message.type === 'shutdown') {
        link.close();
        return;
    }
    if (message.type !== 'command') return;
    if (message.line === 'garbage') {
        process.send?.({ garbage: true });
    }
    link.send({ type: 'command.result', v: 1, id: message.id, ok: true });
    if (message.line === 'exit') {
        void link.flush().then(() => process.exit(0));
    }
});

link.send({ type: 'hello', v: 1, serverVersion: 'fixture', pid: process.pid });
