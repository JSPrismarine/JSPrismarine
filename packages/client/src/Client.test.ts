import { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import Client from './Client';
import { FakeTransport } from './testing/fakeTransport.test.helper';

/** A transport that records each close it is asked for. */
class ClosingTransport extends FakeTransport {
    public readonly closes: string[] = [];

    public override close(reason = 'client disconnect'): void {
        this.closes.push(reason);
    }
}

const clientOver = (transport: ClosingTransport): Client =>
    new Client({ host: '127.0.0.1', logger: new Logger('error'), transport });

describe('Client.disconnect', () => {
    it('closes the transport of a connection the client still holds', async () => {
        const transport = new ClosingTransport();
        const client = clientOver(transport);

        // The login waits on a server that never answers; the transport is connected meanwhile.
        const connecting = client.connect().catch(() => undefined);
        await transport.connect();
        expect(client.isConnected()).toBe(true);

        client.disconnect('done');

        expect(transport.closes).toContain('done');
        expect(client.isConnected()).toBe(false);
        transport.emit('close', 'done');
        await connecting;
    });

    it('closes the transport after the server ended the connection', async () => {
        const transport = new ClosingTransport();
        const client = clientOver(transport);
        const connecting = client.connect().catch(() => undefined);
        await transport.connect();

        // The server drops the connection: the transport reports it, and the client stops counting
        // itself connected. The transport still holds its socket until it is closed.
        transport.emit('close', 'kicked');
        await connecting;
        expect(client.isConnected()).toBe(false);
        const before = transport.closes.length;

        client.disconnect('done');

        expect(transport.closes.slice(before)).toEqual(['done']);
    });

    it('leaves the transport of a client that never dialed alone', () => {
        const transport = new ClosingTransport();
        const client = clientOver(transport);

        client.disconnect('done');

        expect(transport.closes).toEqual([]);
    });
});
