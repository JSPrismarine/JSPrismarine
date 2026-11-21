import type { ConsoleMessage, ServerMessage, SupervisorEvent } from '@jsprismarine/console-protocol';
import { memoryLinkPair } from '@jsprismarine/console-protocol';
import { createTestRenderer } from '@opentui/core/testing';
import type { TestRendererSetup } from '@opentui/core/testing';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startConsole } from '../startConsole';
import type { ConsoleHandle, ConsoleSupervisor, ServerLink } from '../startConsole';
import type { StubServerOptions } from './stubServer.test-utils';
import { StubServer } from './stubServer.test-utils';

/**
 * A {@link ConsoleSupervisor} the test drives: it raises events and attaches links on request,
 * and records the actions the console asks for. `stop` also sends `shutdown` over the current
 * link, as the host's supervisor does.
 */
export function fakeSupervisor() {
    const eventListeners = new Set<(event: SupervisorEvent) => void>();
    const linkListeners = new Set<(link: ServerLink | undefined) => void>();
    const actions: string[] = [];
    let current: ServerLink | undefined;
    const supervisor = {
        /** The actions the console asked for, in order: `restart`, `stop` or `forceStop`. */
        actions,
        onEvent(listener: (event: SupervisorEvent) => void) {
            eventListeners.add(listener);
            return () => {
                eventListeners.delete(listener);
            };
        },
        onLink(listener: (link: ServerLink | undefined) => void) {
            linkListeners.add(listener);
            return () => {
                linkListeners.delete(listener);
            };
        },
        restart: () => void actions.push('restart'),
        stop: () => {
            actions.push('stop');
            current?.send({ type: 'shutdown', v: 1 });
        },
        forceStop: () => void actions.push('forceStop'),
        emit(event: SupervisorEvent) {
            for (const listener of eventListeners) listener(event);
        },
        attach(link: ServerLink | undefined) {
            current = link;
            for (const listener of linkListeners) listener(link);
        },
        get listenerCount() {
            return eventListeners.size + linkListeners.size;
        }
    } satisfies ConsoleSupervisor & Record<string, unknown>;
    return supervisor;
}

/** A fresh history file path in the temp directory. */
export const tempHistoryFile = (): string =>
    join(tmpdir(), `jsp-console-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`, 'history');

/** A console started on OpenTUI's test renderer, wired to a {@link fakeSupervisor}. */
export interface TestConsole {
    test: TestRendererSetup;
    supervisor: ReturnType<typeof fakeSupervisor>;
    handle: ConsoleHandle;
    historyFile: string;
    /** Attaches a new stub server over an in-memory link, as the supervisor does for each server it starts. */
    connect(options?: StubServerOptions): StubServer;
}

/** Starts the real console on a test renderer of the given size. */
export async function startTestConsole(
    size: { width: number; height: number } = { width: 120, height: 40 },
    historyFile = tempHistoryFile()
): Promise<TestConsole> {
    let test: TestRendererSetup | undefined;
    const supervisor = fakeSupervisor();
    const handle = await startConsole({
        supervisor,
        historyFile,
        serverName: 'default',
        version: '1.0.0',
        env: {},
        createRenderer: async () => {
            test = await createTestRenderer({ ...size, exitOnCtrlC: false });
            return test.renderer;
        }
    });
    if (test === undefined) throw new Error('createRenderer was not called');

    return {
        test,
        supervisor,
        handle,
        historyFile,
        connect(options) {
            const [consoleEnd, serverEnd] = memoryLinkPair<ServerMessage, ConsoleMessage>();
            const stub = new StubServer(serverEnd, options);
            supervisor.attach(consoleEnd);
            return stub;
        }
    };
}
