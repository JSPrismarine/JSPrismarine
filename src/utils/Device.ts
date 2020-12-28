export default class Device {
    inputMode = 0;
    id = '';
    os = 0;
    model = '';
    guiScale = 0;

    constructor(args: {
        id: string;
        model: string;
        os: number;
        inputMode: number;
        guiScale: number;
    }) {
        const { id, model, os, inputMode, guiScale } = args;

        this.id = id;
        this.model = model;
        this.os = os;
        this.inputMode = inputMode;
        this.guiScale = guiScale;
    }
}
