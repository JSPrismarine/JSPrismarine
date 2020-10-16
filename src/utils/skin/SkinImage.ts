interface SkinImageData {
    width: number;
    height: number;
    data: Buffer;
}

class SkinImage {
    public width: number;
    public height: number;
    public data: Buffer;

    constructor(options: SkinImageData) {
        this.width = options.width;
        this.height = options.height;
        this.data = options.data;
    }
}
export default SkinImage;