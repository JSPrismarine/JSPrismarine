import type SkinImage from './SkinImage';

/** One animated image included in a serialized player skin. */
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

    /** Returns the image frames for this animation. */
    public getImage(): SkinImage {
        return this.image;
    }

    /** Returns the animation's frame count. */
    public getFrames(): number {
        return this.frames;
    }

    /** Returns the protocol animation type. */
    public getType(): number {
        return this.type;
    }

    /** Returns the animation expression selector. */
    public getExpression(): number {
        return this.expression;
    }
}
