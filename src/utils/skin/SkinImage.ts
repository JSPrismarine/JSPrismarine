interface SkinImageData {
    width: number;
    height: number;
    data: Buffer|string;
}

class SkinImage {
    public width: number;
    public height: number;
    public data: Buffer|string;

    constructor(options: SkinImageData) {
        this.width = options.width;
        this.height = options.height;
        this.data = options.data;
    }
}
export default SkinImage;