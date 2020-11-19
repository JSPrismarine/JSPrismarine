import SkinImage from './SkinImage';

export default class SkinAnimation {
    public image: SkinImage;
    public frames: number;
    public type: number;
    public expression: number;

    constructor({
        image,
        frames,
        type,
        expression
    }: {
        image: SkinImage;
        frames: number;
        type: number;
        expression: number;
    }) {
        this.image = image;
        this.frames = frames;
        this.type = type;
        this.expression = expression;
    }
}
