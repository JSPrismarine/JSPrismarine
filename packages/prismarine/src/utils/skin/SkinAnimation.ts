import SkinImage from './SkinImage';

export default class SkinAnimation {
    private readonly image: SkinImage;
    private readonly frames: number;
    private readonly type: number;
    private readonly expression: number;

    public constructor({
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

    public getImage(): SkinImage {
        return this.image;
    }

    public getFrames(): number {
        return this.frames;
    }

    public getType(): number {
        return this.type;
    }

    public getExpression(): number {
        return this.expression;
    }
}
