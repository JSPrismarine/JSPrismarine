import path from 'path';
import cacache from 'cacache';

export default class CacheManager {
    private filePath: string;

    constructor(loc: string) {
        this.filePath = path.resolve(loc, `cache`); 
    }

    public async putCachedPalette(buffer: Buffer): Promise<void> {
        await cacache.put(this.filePath, 'blockPalette', buffer);
    }

    public async getCachedPalette(): Promise<Buffer> {
        return (await cacache.get(this.filePath, 'blockPalette')).data;
    }
}