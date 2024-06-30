import type Server from '../../../Server';
import type { Generator } from '../../Generator';
import type Chunk from '../../chunk/Chunk';
import BaseProvider from '../BaseProvider';

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FOLDERS = ['data', 'entities', 'playerdata', 'region'];

export default class Anvil extends BaseProvider {
    public constructor(folderPath: string, server: Server) {
        super(folderPath, server);
    }

    private async prepareFolderStructure() {
        if (!fs.existsSync(this.path)) {
            await fs.promises.mkdir(this.path, { recursive: true });
        }

        await Promise.all(
            DEFAULT_FOLDERS.map((dir) => path.join(this.path, dir))
                .filter((dir) => !fs.existsSync(dir))
                .map((dir) => fs.promises.mkdir(dir, { recursive: true }))
        );
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        await this.prepareFolderStructure();
    }
    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {}

    public async readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk> {
        return generator.generateChunk(cx, cz, seed, config);
    }
    public async writeChunk(_chunk: Chunk): Promise<void> {
        // TODO.
        return;
    }
}
