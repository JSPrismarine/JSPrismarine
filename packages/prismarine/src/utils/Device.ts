export default class Device {
    public inputMode = 0;
    public id = '';
    public os = 0;
    public model = '';
    public guiScale = 0;

    public constructor(args: { id: string; model: string; os: number; inputMode: number; guiScale: number }) {
        const { id, model, os, inputMode, guiScale } = args;

        this.id = id;
        this.model = model;
        this.os = os;
        this.inputMode = inputMode;
        this.guiScale = guiScale;
    }
}
