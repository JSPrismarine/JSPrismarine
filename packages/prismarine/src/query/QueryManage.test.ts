import { describe, it, expect } from 'vitest';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import { InetAddress } from '@jsprismarine/raknet';
import QueryManager from './QueryManager';
import Server from '../Server';
// import esmock from 'esmock';

/* 
    TODO
    vi.mock('../Server', () => {
    return class Prismarine {
        public constructor({ logger, config }: any) {}

        public getRaknet() {
            return new (class Raknet {
                public sendBuffer(buffer: Buffer) {}
            })();
        }
    };
}); */

/* const Server = await esmock('../Server', {}, () => {
    return class Prismarine {
        public constructor({ logger, config }: any) {}

        public getRaknet() {
            return new (class Raknet {
                public sendBuffer(buffer: Buffer) {}
            })();
        }
    };
}) */

describe('QueryManager', () => {
    it.skip('handshake', async () => {
        // TODO
        const prismarine = new Server({
            logger: null as any,
            config: null as any,
            version: 'test'
        });
        console.log(prismarine);
        const queryManager = new QueryManager(prismarine);

        let stream = new BinaryStream();
        stream.writeUnsignedShort(65277);
        stream.writeByte(0);
        stream.writeInt(0);
        stream = new BinaryStream(stream.getBuffer());

        const buffer = await queryManager.onRaw(stream.getBuffer(), new InetAddress('0.0.0.0', 19132));
        expect(buffer.toString()).toBe(
            Buffer.from(
                '\u0009\u0000\u0000\u0000\u0000\u0039\u0035\u0031\u0033\u0033\u0030\u0037\u0000',
                'binary'
            ).toString()
        );
    });
});
