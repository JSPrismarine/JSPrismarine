import SkinImage from './SkinImage';

export default class SkinAnimation {
    public image: SkinImage;
    public frames: number;
    public type: number;

    constructor({
        image,
        frames,
        type
    }: {
        image: SkinImage;
        frames: number;
        type: number;
    }) {
        this.image = image;
        this.frames = frames;
        this.type = type;
    }
}
