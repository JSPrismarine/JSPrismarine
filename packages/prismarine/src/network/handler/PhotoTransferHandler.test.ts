import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import PhotoTransferPacket from '@jsprismarine/protocol/packet/PhotoTransferPacket';
import PhotoTransferHandler from './PhotoTransferHandler';

describe('PhotoTransferHandler', () => {
    it('logs the photo name and the image size', () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const session = stub<PlayerSession>({ identity: STEVE });
        const packet = Object.assign(new PhotoTransferPacket(), {
            photoName: 'photo.png',
            photoData: Buffer.alloc(3)
        });

        new PhotoTransferHandler().handle(packet, sessionContext(session, { log }));

        expect(logged).toEqual([
            'Steve sent photo photo.png with 3 byte(s) of image data. The server has no photo storage'
        ]);
    });
});
