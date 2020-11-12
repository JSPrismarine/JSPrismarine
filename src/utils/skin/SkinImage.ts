export default class SkinImage {
    public width: number;
    public height: number;
    public data: string;

    constructor({
        width,
        height,
        data
    }: {
        width: number;
        height: number;
        data: string;
    }) {
        this.width = width;
        this.height = height;
        this.data = data;
    }
}
