import fs from 'fs';

export default class Provider {
    private path: string = '';

    public constructor(path: string) {
        this.path = path;
        if (!fs.existsSync(path)) fs.mkdirSync(path);
    }

    public getPath(): string {
        return this.path;
    }
}
