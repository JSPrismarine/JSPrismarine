import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import type { Arrival } from '../PlayerSession';
import ServerboundLoadingScreenPacket, {
    ServerboundLoadingScreenPacketType
} from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import ServerboundLoadingScreenHandler from './ServerboundLoadingScreenHandler';

const fakeSession = ({ open = [], pending }: { open?: number[]; pending?: number } = {}) => {
    const logged: string[] = [];
    const ended: number[] = [];
    /** Every id the handler asked the session to finish a dimension change under. */
    const completed: number[] = [];
    const released: number[] = [];
    const session = stub<PlayerSession>({
        identity: STEVE,
        endLoadingScreen: (id) => {
            ended.push(id);
            return open.includes(id);
        },
        pendingDimensionChange: () =>
            pending === undefined ? undefined : { loadingScreenId: pending, arrival: stub<Arrival>() },
        completeDimensionChange: (id) => {
            completed.push(id);
            return id === pending;
        },
        releaseArrivalChunks: async (id) => {
            released.push(id);
            return id === pending;
        }
    });

    const { context, outputs, settled } = inputContext(session, {
        log: stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });

    return { logged, ended, completed, released, context, outputs, settled };
};

describe('ServerboundLoadingScreenHandler', () => {
    it('logs the join screen when the id is absent', () => {
        const { logged, context } = fakeSession();
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
            loadingScreenId: null
        });

        new ServerboundLoadingScreenHandler().handle(packet, context);

        expect(logged).toEqual(['Steve opened the join loading screen']);
    });

    it('closes the screen on the session when the client reports the id it was given', async () => {
        const { logged, ended, context, settled } = fakeSession({ open: [3] });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 3
        });

        new ServerboundLoadingScreenHandler().handle(packet, context);
        await settled();

        expect(ended).toEqual([3]);
        expect(logged).toEqual(['Steve closed loading screen 3']);
    });

    it('finishes the pending dimension change when its screen closes', async () => {
        const { logged, completed, context, outputs, settled } = fakeSession({ open: [3], pending: 3 });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 3
        });

        new ServerboundLoadingScreenHandler().handle(packet, context);
        // Finished in the handler, whose unit holds the end of the pending change; its sends are
        // queued, and nothing waits behind the handler.
        expect(outputs).toHaveLength(0);
        expect(completed).toEqual([3]);
        await settled();

        expect(completed).toEqual([3]);
        expect(logged).toEqual(['Steve closed loading screen 3']);
    });

    it('logs a closed screen that is not the pending change and leaves the change pending', async () => {
        const { logged, completed, context, settled } = fakeSession({ open: [2, 3], pending: 3 });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 2
        });

        new ServerboundLoadingScreenHandler().handle(packet, context);
        await settled();

        // The session is asked and says no; the id did not match.
        expect(completed).toEqual([2]);
        expect(logged).toEqual(['Steve closed loading screen 2, not screen 3 of the pending dimension change']);
    });

    it('says so when the closed id matches no screen the session opened', async () => {
        const { logged, context, settled } = fakeSession();
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 9
        });

        new ServerboundLoadingScreenHandler().handle(packet, context);
        await settled();

        expect(logged).toEqual(['Steve closed loading screen 9, which this session never opened']);
    });

    it('logs an opening and closes nothing, since the session already knows the id', async () => {
        const { logged, ended, released, context, settled } = fakeSession({ open: [3] });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
            loadingScreenId: 3
        });

        new ServerboundLoadingScreenHandler().handle(packet, context);
        await settled();

        expect(ended).toEqual([]);
        expect(released).toEqual([3]);
        expect(logged).toEqual(['Steve opened loading screen 3']);
    });

    it("releases the pending change's arrival columns when its screen opens", async () => {
        const { logged, released, context, outputs, settled } = fakeSession({ open: [3], pending: 3 });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
            loadingScreenId: 3
        });

        new ServerboundLoadingScreenHandler().handle(packet, context);
        // Released in the handler; the columns are a send the step waits for.
        expect(released).toEqual([3]);
        expect(outputs).toHaveLength(1);
        await settled();

        expect(released).toEqual([3]);
        expect(logged).toEqual(['Steve opened loading screen 3; sending its arrival columns']);
    });
});
