export default class Device {
    inputMode: number = 0;
    id: string = '';
    os: number = 0;
    model: string = '';
    guiScale: number = 0;

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
