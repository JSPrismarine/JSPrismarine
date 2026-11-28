import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { describe, expect, it } from 'vitest';

import type { JavaResourcePack } from '../../resourcePacks/JavaResourcePacks';
import { stub } from '../../testing/stub.test.helper';
import type { JavaConnection } from './JavaConnection';
import type { JavaResourcePackOffer } from './javaResourcePack';
import { updateResourcePack } from './javaResourcePack';

const packOf = (name: string): JavaResourcePack => ({
    id: `00000000-0000-4000-8000-00000000000${name}`,
    key: name.repeat(64),
    sha1: name.repeat(40),
    bytes: new Uint8Array()
});

describe('updateResourcePack', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(packOf);

    /** A connection that records what it is sent, and an offer of whatever pack the test sets. */
    const harness = () => {
        const sent: string[] = [];
        const connection = stub<JavaConnection>({
            send: <D extends JavaPacketDefinition>(packet: D, payload: JavaPayload<D>) => {
                // Both packets name the pack by `id`; read back as JSON, which needs no cast.
                const { id }: { id: string | null } = JSON.parse(JSON.stringify(payload));
                sent.push(`${packet.name.startsWith('Add') ? 'push' : 'pop'} ${id}`);
            }
        });
        let current: JavaResourcePack | undefined;
        const offer: JavaResourcePackOffer = {
            current: async () => current,
            urlOf: (pack) => `http://localhost/${pack.sha1}.zip`,
            required: () => false
        };
        return {
            sent,
            connection,
            update: async (pack: JavaResourcePack | undefined) => {
                current = pack;
                await updateResourcePack(connection, offer);
            }
        };
    };

    it('removes a pack still downloading when the server moves on to another, or to none', async () => {
        const { sent, connection, update } = harness();
        connection.resourcePack = { loaded: a };

        await update(b);
        await update(c);
        await update(undefined);

        expect(sent).toEqual([`push ${b!.id}`, `pop ${b!.id}`, `push ${c!.id}`, `pop ${c!.id}`, `pop ${a!.id}`]);
        expect(connection.resourcePack).toEqual({ loaded: undefined, pending: undefined });
    });

    it('keeps the loaded pack, and drops the one downloading, when the server goes back to it', async () => {
        const { sent, connection, update } = harness();
        connection.resourcePack = { loaded: a };

        await update(b);
        await update(a);

        expect(sent).toEqual([`push ${b!.id}`, `pop ${b!.id}`]);
        expect(connection.resourcePack).toEqual({ loaded: a, pending: undefined });
    });
});
