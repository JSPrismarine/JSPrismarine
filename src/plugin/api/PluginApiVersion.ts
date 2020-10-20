import Prismarine from "../../Prismarine";

export default class PluginApiVersion {
    private version: string;

    constructor(version: string) {
        this.version = version;
    }

    public getVersion() {
        return this.version;
    }
};
