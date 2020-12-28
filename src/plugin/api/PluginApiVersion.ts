export default class PluginApiVersion {
    private readonly version: string;

    constructor(version: string) {
        this.version = version;
    }

    public getVersion() {
        return this.version;
    }
}
