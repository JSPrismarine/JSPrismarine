import BinaryStream from '@jsprismarine/jsbinaryutils';
import InetAddress from '../network/raknet/utils/InetAddress';
import Server from '../Server';
import QueryManager from './QueryManager';

jest.mock('../Server', () => {
    return class Prismarine {
        constructor({ logger, config }: any) {}

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
            logger: null as any,
            config: null as any
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
                '\u0009\u0000\u0000\u0000\u0000\u0039\u0035\u0031\u0033\u0033\u0030\u0037\u0000',
                'binary'
            ).toString()
        );
        done();
    });
});
