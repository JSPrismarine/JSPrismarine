/**
 * Runs a script under a debugger session on a worker thread, as a world thread will: the session
 * reads the extension's messages from a channel, and blocks this thread while the script is
 * stopped. It posts the target the extension picked and the script's result.
 */
import { parentPort, workerData } from 'node:worker_threads';

import { ScriptHostLibrary } from '../ScriptEngine';
import { ScriptDebugSession } from '../debugger/DebugSession';
import { PortDebuggerChannel } from '../debugger/channel';
import type { DebuggerChannelEndpoint } from '../debugger/channel';
import type { DebuggerPlugin } from '../debugger/protocol';

/** What the test hands the worker. */
export interface DebuggerWorkerData {
    readonly endpoint: DebuggerChannelEndpoint;
    readonly plugins: readonly DebuggerPlugin[];
    readonly file: string;
    readonly source: string;
}

/** What the worker reports. */
export interface DebuggerWorkerReport {
    readonly target: string | undefined;
    readonly result: unknown;
}

// Structured clone hands the worker plain data; DebuggerWorkerData is what the test posts.
const data = workerData as DebuggerWorkerData;
const channel = new PortDebuggerChannel(data.endpoint);
const session = new ScriptDebugSession(channel, { plugins: data.plugins });
const library = ScriptHostLibrary.load();
const engine = library.createEngine();

const target = session.handshake();
session.attach(engine);
const result = engine.evaluate(data.source, data.file);
session.detach();
channel.close();
engine.destroy();
library.close();

const report: DebuggerWorkerReport = { target, result };
parentPort?.postMessage(report);
