import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionContext } from '../../../testing/handlerContext.test.helper';
import { stub } from '../../../testing/stub.test.helper';
import type PlayerSession from '../../../player/PlayerSession';
import ClientCameraAimAssistPacket, {
    ClientCameraAimAssistAction
} from '@jsprismarine/protocol/bedrock/packet/ClientCameraAimAssistPacket';
import PacketHandlerRegistry from '../../../network/PacketHandlerRegistry';
import ClientCameraAimAssistHandler from './ClientCameraAimAssistHandler';

describe('ClientCameraAimAssistPacket', () => {
    it('resolves to a handler in the registry', async () => {
        const registry = new PacketHandlerRegistry({
            getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} })
        });
        await registry.enable();

        expect(registry.getHandler('ClientCameraAimAssistPacket')).toBeInstanceOf(ClientCameraAimAssistHandler);
    });

    it('accepts an activation report while aim assist is unsupported', () => {
        const packet = new ClientCameraAimAssistPacket({
            cameraPresetId: 'minecraft:default',
            action: ClientCameraAimAssistAction.SET_FROM_CAMERA_PRESET,
            allowAimAssist: true
        });

        expect(() =>
            new ClientCameraAimAssistHandler().handle(packet, sessionContext(stub<PlayerSession>()))
        ).not.toThrow();
    });
});
