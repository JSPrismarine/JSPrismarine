import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import ClientboundDataStorePacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataStorePacket';
import ServerboundDataDrivenScreenClosedPacket, {
    DataDrivenScreenClosedReason
} from '@jsprismarine/protocol/bedrock/packet/ServerboundDataDrivenScreenClosedPacket';
import ServerboundDataStorePacket from '@jsprismarine/protocol/bedrock/packet/ServerboundDataStorePacket';
import DataStoreUpdate, { DataStoreValueType } from '@jsprismarine/protocol/bedrock/structure/DataStoreUpdate';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { DataDrivenResponse } from '@jsprismarine/script-host/host/world';
import { inputContext } from '../../../testing/handlerContext.test.helper';
import { stub } from '../../../testing/stub.test.helper';
import { STEVE } from '../../../testing/sessionIdentity.test.helper';
import type ClientConnection from '../../../network/ClientConnection';
import type PlayerSession from '../../../player/PlayerSession';
import { dataDrivenScreensOf } from '../../../scripting/DataDrivenScreens';
import ServerboundDataDrivenScreenClosedHandler from './ServerboundDataDrivenScreenClosedHandler';
import ServerboundDataStoreHandler from './ServerboundDataStoreHandler';

/** A 2225 session with one custom form open as form 4, whose writes and closes reach `answers`. */
const fakeSession = () => {
    const debug: string[] = [];
    const answers: DataDrivenResponse[] = [];
    const sent: NetworkPacket<unknown>[] = [];
    const session = stub<PlayerSession>({
        identity: STEVE,
        getRuntimeId: () => 7n,
        getConnection: () =>
            stub<ClientConnection>({ codec: stub<ClientConnection['codec']>({ protocolVersion: 2225 }) }),
        send: async (packet) => void sent.push(packet),
        released: () => {}
    });
    dataDrivenScreensOf(session).show(4, {
        screenId: 'minecraft:custom_form',
        property: 'custom_form_data_1',
        instance: 1,
        value: { title: 'T', layout: { length: 0n } },
        updates: []
    });
    sent.splice(0);
    const { context } = inputContext(session, {
        log: stub<Logger>({ debug: (...message) => void debug.push(message[0] ?? '') }),
        services: {
            scriptForms: {
                answerForm: () => true,
                answerDataDriven: (response) => {
                    answers.push(response);
                    return true;
                }
            }
        }
    });
    return { debug, answers, sent, context };
};

const write = (property: string) =>
    new ServerboundDataStorePacket({
        update: new DataStoreUpdate(
            'minecraft',
            property,
            'layout[0].onClick',
            { type: DataStoreValueType.DOUBLE, value: 1 },
            1,
            1
        ),
        variableUpdate: null
    });

describe('ServerboundDataStoreHandler', () => {
    it("hands a write to an open screen's property to the scripts under the player's script id", () => {
        const { answers, debug, context } = fakeSession();
        new ServerboundDataStoreHandler().handle(write('custom_form_data_1'), context);
        expect(answers).toEqual([{ player: '7', property: 'custom_form_data_1', path: 'layout[0].onClick', value: 1 }]);
        expect(debug).toEqual([]);
    });

    it('drops a write to a property no open screen has', () => {
        const { answers, debug, context } = fakeSession();
        new ServerboundDataStoreHandler().handle(write('custom_form_data_9'), context);
        expect(answers).toEqual([]);
        expect(debug).toEqual(["Steve wrote to a data store property that is not an open screen's"]);
    });
});

describe('ServerboundDataDrivenScreenClosedHandler', () => {
    it("clears the screen's property and hands the reason to the scripts", () => {
        const { answers, sent, context } = fakeSession();
        const closed = new ServerboundDataDrivenScreenClosedPacket({
            formId: 4,
            closeReason: DataDrivenScreenClosedReason.ClientCanceled
        });
        new ServerboundDataDrivenScreenClosedHandler().handle(closed, context);
        expect(answers).toEqual([{ player: '7', formId: 4, reason: 'clientcanceled' }]);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toBeInstanceOf(ClientboundDataStorePacket);

        new ServerboundDataDrivenScreenClosedHandler().handle(closed, context);
        expect(answers).toHaveLength(1);
    });
});
