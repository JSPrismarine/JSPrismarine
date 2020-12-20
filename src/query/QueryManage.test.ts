import BinaryStream from '@jsprismarine/jsbinaryutils';
import InetAddress from '../network/raknet/utils/InetAddress';
import Server from '../Server';
import QueryManager from './QueryManager';

jest.mock('../Server', () => {
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
        const prismarine = new Server({
            logger: null,
            config: null
        });
        const queryManager = new QueryManager(prismarine);

        const stream = new BinaryStream();
        stream.writeShort(65277);
        stream.writeByte(0);
        stream.writeInt(0);
        (stream as any).offset = 0;

        const buffer = await queryManager.onRaw(
            stream.getBuffer(),
            new InetAddress('0.0.0.0', 19132)
        );
        expect(buffer.toString()).toBe(
            Buffer.from(
                '\x09\x00\x00\x00\x00\x39\x35\x31\x33\x33\x30\x37\x00',
                'binary'
            ).toString()
        );
        done();
    });
});
