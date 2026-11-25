import { Gametype } from '@jsprismarine/minecraft';

import type { HandlerLog } from '../player/context/HandlerContext';
import type { DecodeView } from '../editions/bedrock/decoder/DecodeView';
import { stub } from './stub.test.helper';

/** What a test may set on the view {@link decodeView} builds. */
export interface ViewParts {
    readonly runtimeId?: bigint;
    readonly name?: string;
    readonly gamemode?: Gametype;
    /** The runtime ids the sender has been shown, beside its own. */
    readonly tracked?: readonly bigint[];
}

/**
 * A decoder's view of a sender named `tester` with runtime id 7, which keeps every line a decoder
 * logs so a packet the decoder should have refused shows up as a line.
 *
 * @returns The view and the lines logged at debug or verbose level, in order.
 */
export const decodeView = (parts: ViewParts = {}) => {
    const logged: string[] = [];
    const runtimeId = parts.runtimeId ?? 7n;
    const tracked = new Set([runtimeId, ...(parts.tracked ?? [])]);
    const log = stub<HandlerLog>({
        debug: (...message) => void logged.push(String(message[0] ?? '')),
        verbose: (...message) => void logged.push(String(message[0] ?? ''))
    });
    const view: DecodeView = {
        log,
        runtimeId,
        name: parts.name ?? 'tester',
        gamemode: parts.gamemode ?? Gametype.SURVIVAL,
        tracks: (id) => tracked.has(id)
    };
    return { view, logged };
};
