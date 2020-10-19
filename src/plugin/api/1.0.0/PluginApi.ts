import PluginApiVersion from "../PluginApiVersion";

export const PLUGIN_API_VERSION = '1.0.0';

export default class PluginApi extends PluginApiVersion {
    constructor() {
        super(PLUGIN_API_VERSION);
    };
};
