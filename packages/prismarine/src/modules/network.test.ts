import { describe, expect, it } from 'vitest';

import { startTestModule } from '@jsprismarine/kernel/testing';
import { stub } from '../testing/stub.test.helper';
import type Server from '../Server';
import type { Networking } from './network';
import { ServerNetworking, networkModule } from './network';
import { networkToken } from './tokens';

describe('modules/network', () => {
    it('provides the networking the server constructed under the network token', async () => {
        const networking = stub<Networking>({});

        const handle = await startTestModule(networkModule(networking));
        try {
            expect(handle.get(networkToken)).toBe(networking);
        } finally {
            await handle.stop();
        }
    });

    it('survives a kernel restart without touching the listener', async () => {
        // A reload stops and restarts the kernel while the listener stays bound,
        // so the module must not start or kill anything in its own lifecycle.
        const networking = stub<Networking>({});

        const handle = await startTestModule(networkModule(networking));
        await handle.stop();
        await handle.start();
        try {
            expect(handle.get(networkToken)).toBe(networking);
        } finally {
            await handle.stop();
        }
    });

    it('has no listener and ignores a kill before start', () => {
        const networking = new ServerNetworking(stub<Server>({}));

        expect(networking.getListener()).toBeUndefined();
        expect(() => networking.kill()).not.toThrow();
    });
});
