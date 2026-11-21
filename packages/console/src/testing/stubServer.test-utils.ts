// `__fixtures__/stubServer.ts` runs this file in a child process under Node's type stripping,
// which cannot follow the workspace packages' extensionless imports. Keep every import here
// type-only and the syntax erasable.
import type {
    CommandInfo,
    ConsoleMessage,
    ConsoleMessageType,
    LifecycleState,
    MessageLink,
    ServerMessage
} from '@jsprismarine/console-protocol';

/** A server message without its `v`, which the stub stamps. */
type Unversioned<M> = M extends unknown ? Omit<M, 'v'> : never;

/** One step of a script: a message to send, or a pause until the console sends a message of a type. */
export type ScriptStep = Unversioned<ServerMessage> | { waitFor: ConsoleMessageType };

/** The console request types the stub answers. */
export type RequestType = 'command' | 'complete' | 'commands';

/** How the stub answers the console. Every field is plain data, so a script can cross a process boundary. */
export interface StubServerOptions {
    /** The list each `commands` request gets, in turn; the last one repeats. Defaults to {@link COMMANDS}. */
    commands?: readonly (readonly CommandInfo[])[];
    /** Results by command line. A line not listed succeeds. */
    results?: Readonly<Record<string, { ok: boolean; error?: string }>>;
    /** Requests the stub holds unanswered until {@link StubServer.release}. */
    hold?: readonly RequestType[];
    /** Requests the stub never answers. */
    drop?: readonly RequestType[];
}

/** The commands a stub lists unless told otherwise. */
export const COMMANDS: readonly CommandInfo[] = [
    { name: 'help', description: 'Lists the commands.', aliases: ['?'], usage: ['help', 'help <command>'] },
    {
        name: 'say',
        description: 'Broadcasts a message.',
        aliases: [],
        usage: ['say <message>'],
        usageWords: [['rest']]
    },
    { name: 'stop', description: 'Stops the server.', aliases: [], usage: ['stop'] }
];

/**
 * The order a real server reports its startup in, which `Server.test.ts` in
 * `@jsprismarine/prismarine` pins: `hello`, `lifecycle starting`, each step starting and then
 * started, then `lifecycle running`. Change both together.
 */
export const STARTUP: readonly ScriptStep[] = [
    { type: 'hello', serverVersion: '1.0.0', pid: 1 },
    { type: 'lifecycle', state: 'starting' },
    { type: 'boot', step: 'prismarine:config', state: 'starting' },
    { type: 'boot', step: 'prismarine:config', state: 'started' },
    { type: 'boot', step: 'prismarine:content', state: 'starting' },
    { type: 'boot', step: 'prismarine:content', state: 'started' },
    { type: 'boot', step: 'prismarine:world', state: 'starting' },
    { type: 'boot', step: 'prismarine:world', state: 'started' },
    { type: 'lifecycle', state: 'running' }
];

type Received<T extends ConsoleMessageType> = Extract<ConsoleMessage, { type: T }>;
type Answerable = Received<RequestType>;

/**
 * A scripted server for console tests: it speaks the console protocol over the link it is
 * given, answers `command`, `complete` and `commands` requests from {@link StubServerOptions},
 * and records everything the console sends. On `shutdown` it reports `lifecycle stopping` and
 * closes the link, as a server that stops cleanly does.
 */
export class StubServer {
    /** Every message the console sent, in order. */
    public readonly received: ConsoleMessage[] = [];
    private readonly waiters = new Set<{ type: ConsoleMessageType; count: number; resolve: () => void }>();
    private readonly held: Answerable[] = [];
    private commandsAnswered = 0;
    /** The server end of the console link. */
    public readonly link: MessageLink<ConsoleMessage, ServerMessage>;
    private readonly options: StubServerOptions;

    // Plain fields rather than parameter properties, which type stripping cannot erase.
    public constructor(link: MessageLink<ConsoleMessage, ServerMessage>, options: StubServerOptions = {}) {
        this.link = link;
        this.options = options;
        link.onMessage((message) => this.onMessage(message));
    }

    /** Sends a message, stamping the protocol version. */
    public send(message: Unversioned<ServerMessage>): void {
        // The spread loses the union's link between `type` and the fields; `message` was one member of it.
        this.link.send({ ...message, v: 1 } as ServerMessage);
    }

    /** Runs a script: sends its messages in order and pauses at each `waitFor` until the console sends one more of that type. */
    public async play(script: readonly ScriptStep[]): Promise<void> {
        for (const step of script) {
            if ('waitFor' in step) await this.waitFor(step.waitFor, this.count(step.waitFor) + 1);
            else this.send(step);
        }
    }

    /** Sends a `lifecycle` message. */
    public lifecycle(state: LifecycleState): void {
        this.send({ type: 'lifecycle', state });
    }

    /** Resolves once the console has sent `count` messages of a type in all, counting those already received. */
    public waitFor(type: ConsoleMessageType, count = 1): Promise<void> {
        if (this.count(type) >= count) return Promise.resolve();
        return new Promise((resolve) => {
            this.waiters.add({ type, count, resolve });
        });
    }

    /** Answers the held requests of a type, oldest first: all of them, or the first `count`. */
    public release(type: RequestType, count = Number.POSITIVE_INFINITY): void {
        for (const message of this.held.filter((held) => held.type === type).slice(0, count)) {
            this.held.splice(this.held.indexOf(message), 1);
            this.answer(message);
        }
    }

    /** Closes the link, as a server that dies does. */
    public close(): void {
        this.link.close();
    }

    /** How many messages of a type the console has sent. */
    public count(type: ConsoleMessageType): number {
        return this.received.filter((message) => message.type === type).length;
    }

    private onMessage(message: ConsoleMessage): void {
        this.received.push(message);
        if (message.type === 'shutdown') {
            this.lifecycle('stopping');
            this.close();
        } else if (message.type === 'command' || message.type === 'complete' || message.type === 'commands') {
            if (this.options.drop?.includes(message.type)) {
                // Never answered.
            } else if (this.options.hold?.includes(message.type)) this.held.push(message);
            else this.answer(message);
        }
        for (const waiter of this.waiters) {
            if (this.count(waiter.type) < waiter.count) continue;
            this.waiters.delete(waiter);
            waiter.resolve();
        }
    }

    private answer(message: Answerable): void {
        switch (message.type) {
            case 'command': {
                const result = this.options.results?.[message.line] ?? { ok: true };
                this.send({ type: 'command.result', id: message.id, ...result });
                return;
            }
            case 'complete': {
                const typed = message.line.slice(0, message.cursor);
                const names = this.commandList().map(({ name }) => name);
                const completions = typed.includes(' ') ? [] : names.filter((name) => name.startsWith(typed));
                this.send({ type: 'complete.result', id: message.id, completions, replace: typed });
                return;
            }
            case 'commands': {
                const commands = this.commandList();
                this.commandsAnswered++;
                this.send({ type: 'commands.result', id: message.id, commands });
                return;
            }
        }
    }

    private commandList(): readonly CommandInfo[] {
        const lists = this.options.commands ?? [COMMANDS];
        return lists[Math.min(this.commandsAnswered, lists.length - 1)] ?? [];
    }
}
