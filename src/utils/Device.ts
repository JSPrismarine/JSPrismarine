interface DeviceInfo {
    id: string;
    model: string;
    os: number;
    inputMode: number;
    guiScale: number;
}

class Device {
    public inputMode: number;
    public id: string;
    public os: number;
    public model: string;
    public guiScale: number;

    constructor(options: DeviceInfo) {
        this.id = options.id;
        this.model = options.model;
        this.os = options.os;
        this.inputMode = options.inputMode;
        this.guiScale = options.guiScale;
    }
}
export default Device;