export default class SkinImage {
    public width: number;
    public height: number;
    public data: Buffer;

    public constructor({
        width,
        height,
        data
    }: {
        width: number;
        height: number;
        data: Buffer;
    }) {
        this.width = width;
        this.height = height;
        this.data = data;
    }
}
