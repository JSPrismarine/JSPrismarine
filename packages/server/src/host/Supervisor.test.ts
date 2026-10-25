import type { ConsoleMessage, MessageLink, ServerMessage, SupervisorEvent } from '@jsprismarine/console-protocol';
import { memoryLinkPair } from '@jsprismarine/console-protocol';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { ExitListener, OutputListener, ServerChild } from './ServerChild';
import { Supervisor } from './Supervisor';

/** A server child that exits only when the test says so. */
class FakeChild implements ServerChild {
    public readonly pid: number;
    public readonly link: MessageLink<ServerMessage, ConsoleMessage>;
    /** The server's end of the link, for the test to send `lifecycle` messages from. */
    public readonly server: MessageLink<ConsoleMessage, ServerMessage>;
    public readonly stop = vi.fn();
    public readonly kill = vi.fn();
    private readonly outputListeners = new Set<OutputListener>();
    private readonly exitListeners = new Set<ExitListener>();

    public constructor(pid: number) {
        this.pid = pid;
        [this.link, this.server] = memoryLinkPair<ServerMessage, ConsoleMessage>();
    }

    public onOutput(listener: OutputListener): () => void {
        this.outputListeners.add(listener);
        return () => this.outputListeners.delete(listener);
    }

    public onExit(listener: ExitListener): () => void {
        this.exitListeners.add(listener);
        return () => this.exitListeners.delete(listener);
    }

    public write(stream: 'stdout' | 'stderr', text: string): void {
        for (const listener of this.outputListeners) listener(stream, text);
    }

    public exit(code: number | null, signal: NodeJS.Signals | null = null): void {
        this.link.close();
        for (const listener of this.exitListeners) listener(code, signal);
    }

    public async running(): Promise<void> {
        this.server.send({ type: 'lifecycle', v: 1, state: 'running' });
        await settle();
    }
}

const settle = () => new Promise((done) => setTimeout(done, 0));

const setup = () => {
    const children: FakeChild[] = [];
    const exit = vi.fn<(code: number) => void>();
    const supervisor = new Supervisor({
        spawnChild: async () => {
            const child = new FakeChild(100 + children.length);
            children.push(child);
            return child;
        },
        exit
    });
    const events: SupervisorEvent[] = [];
    supervisor.onEvent((event) => events.push(event));
    const states = () =>
        events.flatMap((event) => (event.type === 'supervisor.state' ? [`${event.generation}:${event.state}`] : []));
    return { supervisor, children, exit, events, states };
};

describe('Supervisor', () => {
    it('reports starting on spawn and running when the child says so', async () => {
        const { supervisor, children, states } = setup();
        const links: unknown[] = [];
        supervisor.onLink((link) => links.push(link));

        await supervisor.start();
        await children[0]?.running();

        expect(states()).toEqual(['1:starting', '1:running']);
        expect(links).toEqual([children[0]?.link]);
        expect(supervisor.serverLink).toBe(children[0]?.link);
    });

    it('forwards the child output as supervisor output', async () => {
        const { supervisor, children, events } = setup();
        await supervisor.start();

        children[0]?.write('stderr', 'Server stopped, Goodbye!');

        expect(events).toContainEqual({
            type: 'supervisor.output',
            stream: 'stderr',
            text: 'Server stopped, Goodbye!'
        });
    });

    it('restarts only after the old child has exited', async () => {
        const { supervisor, children, states, exit } = setup();
        await supervisor.start();
        await children[0]?.running();

        supervisor.restart('packages/alpha/src/a.ts');
        expect(children[0]?.stop).toHaveBeenCalledTimes(1);
        expect(children).toHaveLength(1);

        children[0]?.exit(0);
        await settle();

        expect(children).toHaveLength(2);
        expect(supervisor.serverLink).toBe(children[1]?.link);
        expect(states()).toEqual(['1:starting', '1:running', '1:stopping', '1:restarting', '2:starting']);
        expect(exit).not.toHaveBeenCalled();
    });

    it('queues one restart while a spawn is in flight', async () => {
        const { supervisor, children } = setup();
        const started = supervisor.start();
        supervisor.restart('early');
        supervisor.restart('again');
        await started;

        expect(children).toHaveLength(1);
        expect(children[0]?.stop).toHaveBeenCalledTimes(1);

        children[0]?.exit(0);
        await settle();
        expect(children).toHaveLength(2);
    });

    it('waits after a crash instead of exiting, then restarts on request', async () => {
        const { supervisor, children, states, exit } = setup();
        await supervisor.start();

        children[0]?.exit(1);
        await settle();

        expect(states()).toEqual(['1:starting', '1:crashed', '1:waiting']);
        expect(supervisor.state).toBe('waiting');
        expect(exit).not.toHaveBeenCalled();
        expect(supervisor.serverLink).toBeUndefined();

        supervisor.restart('packages/alpha/src/a.ts');
        await settle();
        expect(children).toHaveLength(2);
        expect(states().at(-1)).toBe('2:starting');
    });

    it('stops the child and exits with its code', async () => {
        const { supervisor, children, states, exit } = setup();
        await supervisor.start();
        await children[0]?.running();

        supervisor.stop();
        expect(children[0]?.stop).toHaveBeenCalledTimes(1);
        children[0]?.exit(0);

        expect(states()).toEqual(['1:starting', '1:running', '1:stopping', '1:stopped']);
        expect(exit).toHaveBeenCalledWith(0);
        expect(children).toHaveLength(1);
    });

    it('propagates a non-zero code from a child that was asked to stop', async () => {
        const { supervisor, children, exit, states } = setup();
        await supervisor.start();

        supervisor.stop();
        children[0]?.exit(3);

        expect(states().at(-1)).toBe('1:stopped');
        expect(exit).toHaveBeenCalledWith(3);
    });

    it('drops a queued restart when a stop arrives first', async () => {
        const { supervisor, children, exit } = setup();
        await supervisor.start();

        supervisor.restart('change');
        supervisor.stop();
        children[0]?.exit(0);
        await settle();

        expect(children).toHaveLength(1);
        expect(exit).toHaveBeenCalledWith(0);
    });

    it('exits at once when stopped with no child', async () => {
        const { supervisor, children, exit } = setup();
        await supervisor.start();
        children[0]?.exit(1);

        supervisor.stop();

        expect(exit).toHaveBeenCalledWith(0);
    });

    it('stops on the first signal and kills on the second', async () => {
        const { supervisor, children, exit } = setup();
        const signals = new EventEmitter();
        supervisor.handleSignals(signals);
        await supervisor.start();

        signals.emit('SIGTERM');
        expect(children[0]?.stop).toHaveBeenCalledTimes(1);
        expect(children[0]?.kill).not.toHaveBeenCalled();

        signals.emit('SIGINT');
        expect(children[0]?.kill).toHaveBeenCalledTimes(1);

        children[0]?.exit(null, 'SIGKILL');
        expect(exit).toHaveBeenCalledWith(1);
    });

    it('takes a stopping notice from the child without repeating it', async () => {
        const { supervisor, children, states } = setup();
        await supervisor.start();
        await children[0]?.running();

        children[0]?.server.send({ type: 'lifecycle', v: 1, state: 'stopping' });
        await settle();
        supervisor.stop();

        expect(states()).toEqual(['1:starting', '1:running', '1:stopping']);
    });
});
