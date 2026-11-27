import { Logger } from '@jsprismarine/logger';
import ClientboundDataDrivenUICloseScreenPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataDrivenUICloseScreenPacket';
import ClientboundDataDrivenUIShowScreenPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataDrivenUIShowScreenPacket';
import ClientboundDataStorePacket, {
    DataStoreEntryType
} from '@jsprismarine/protocol/bedrock/packet/ClientboundDataStorePacket';
import ServerboundDataDrivenScreenClosedPacket from '@jsprismarine/protocol/bedrock/packet/ServerboundDataDrivenScreenClosedPacket';
import type { DataStoreVariableEntry } from '@jsprismarine/protocol/bedrock/packet/ClientboundDataStorePacket';
import ServerboundDataStorePacket from '@jsprismarine/protocol/bedrock/packet/ServerboundDataStorePacket';
import { DataStoreValueType } from '@jsprismarine/protocol/bedrock/structure/DataStoreUpdate';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { describe, expect, it } from 'vitest';

import DataDrivenScreens from './DataDrivenScreens';
import ClientPacketRegistry from './net/ClientPacketRegistry';
import ClientSession from './net/ClientSession';
import { FakeTransport } from './testing/fakeTransport.test.helper';

/** A client at protocol 2259, whose server sends each value of a screen as a variable. */
const newScreens = () => {
    const transport = new FakeTransport();
    const registry = new ClientPacketRegistry(2259);
    registry.registerAll([...DataDrivenScreens.PACKETS]);
    const session = new ClientSession(transport, registry, new Logger('error'));
    session.setPhase('play');
    const screens = new DataDrivenScreens(session, 2259);
    /** Delivers packets encoded at 2259, as that server writes them. */
    const deliver = async (...packets: NetworkPacket<unknown>[]): Promise<void> => {
        for (const packet of packets) packet.codecProtocol = 2259;
        await transport.deliver(...packets);
        await session.settled();
    };
    /** Decodes what the client sent at 2259. */
    const sent = async <T>(Packet: new (data: null, buffer: Buffer) => NetworkPacket<T>): Promise<T[]> =>
        (await transport.sentPackets()).flatMap((buffer) => {
            const packet = new Packet(null, buffer);
            packet.codecProtocol = 2259;
            try {
                packet.decode();
            } catch {
                return [];
            }
            const data = packet.getPacketData();
            return data === null ? [] : [data];
        });
    return { screens, deliver, sent };
};

const variable = (path: string, value: number | string, updateCount = 1): DataStoreVariableEntry => ({
    type: DataStoreEntryType.CHANGE,
    change: {
        variableName: `minecraft.custom_form_data_5.${path}`,
        updateCount,
        value:
            typeof value === 'number'
                ? { type: DataStoreValueType.DOUBLE, value }
                : { type: DataStoreValueType.STRING, value }
    }
});

describe('DataDrivenScreens at protocol 2259', () => {
    it('keeps each variable by path, writes with a higher count, and answers the server closing every screen', async () => {
        const { screens, deliver, sent } = newScreens();
        await deliver(
            new ClientboundDataStorePacket({
                updates: [],
                variableUpdates: [variable('title', 'Settings'), variable('layout[0].value', 3)]
            }),
            new ClientboundDataDrivenUIShowScreenPacket({
                screenId: 'minecraft:custom_form',
                formId: 2,
                dataInstanceId: 5
            })
        );
        const [screen] = screens.screens();
        expect(screen?.property).toBe('custom_form_data_5');
        expect([...(screen?.values ?? [])]).toEqual([
            ['title', 'Settings'],
            ['layout[0].value', 3]
        ]);

        await deliver(
            new ClientboundDataStorePacket({ updates: [], variableUpdates: [variable('layout[0].value', 4, 2)] })
        );
        expect(screen?.values.get('layout[0].value')).toBe(4);
        await screens.write(2, 'layout[0].value', 6);
        expect((await sent(ServerboundDataStorePacket)).map((each) => each.variableUpdate)).toEqual([
            {
                variableName: 'minecraft.custom_form_data_5.layout[0].value',
                data: { type: DataStoreValueType.DOUBLE, value: 6 },
                updateCount: 3
            }
        ]);

        await deliver(new ClientboundDataDrivenUICloseScreenPacket({ formId: undefined }));
        expect(screens.screens()).toEqual([]);
        expect(await sent(ServerboundDataDrivenScreenClosedPacket)).toEqual([
            { formId: 2, closeReason: 'programmaticcloseall' }
        ]);
    });
});
