import { Config, Logger, Server, Protocol } from '@jsprismarine/prismarine';

import Updater from '@jsprismarine/updater';
import exitHook from 'async-exit-hook';
import fs from 'node:fs';
import path from 'node:path';

// Process metadata
process.title = 'Prismarine';

if (process.env.JSP_DIR && !fs.existsSync(path.join(process.cwd(), process.env.JSP_DIR)))
    fs.mkdirSync(path.join(process.cwd(), process.env.JSP_DIR));

const version = process.env.npm_package_version!;

const config = new Config(version);
const logger = new Logger();
const updater = new Updater({
    config,
    logger,
    version
});
const server = new Server({
    config,
    logger,
    version
});

exitHook(async () => {
    await server.shutdown();
});

await updater.check();

const pk = new Protocol.Packets.UpdateAttributesPacket(Buffer.from('1d0201000000000000003fcdcccc3dcdcccc3d126d696e6563726166743a6d6f76656d656e740000', 'hex'));
pk.decode();

console.log(pk);

try {
    await server.bootstrap(config.getServerIp(), config.getServerPort());
} catch (e) {
    logger.error(`Cannot start the server, is it already running on the same port? (${<Error>e})`, 'Prismarine');
    await server.shutdown({ crash: true });
    process.exit(1);
}
