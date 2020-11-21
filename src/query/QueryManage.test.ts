import QueryManager from './QueryManager';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import Prismarine from '../Prismarine';

jest.mock('../Prismarine', () => {
    return class Prismarine {
        constructor({ logger, config }) {}

        public getRaknet() {
            return new (class Raknet {
                sendBuffer(buffer: Buffer) {}
            })();
        }
    };
});

describe('QueryManager', () => {
    it('handshake', async (done) => {
        const prismarine = new Prismarine({
            logger: null,
            config: null
        });
        const queryManager = new QueryManager(prismarine);

        const stream = new BinaryStream();
        stream.writeShort(65277);
        stream.writeByte(0);
        stream.writeInt(0);
        (stream as any).offset = 0;

        const buffer = await queryManager.onRaw(stream.getBuffer(), {} as any);
        expect(buffer.toString()).toBe(
            Buffer.from(
                '\x09\x00\x00\x00\x00\x39\x35\x31\x33\x33\x30\x37\x00',
                'binary'
            ).toString()
        );
        done();
    });
});
