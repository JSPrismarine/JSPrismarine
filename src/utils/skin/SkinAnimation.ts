import type SkinImage from "./SkinImage";

interface SkinAnimationData {
    image: SkinImage;
    frames: number;
    type: number;
}
class SkinAnimation {
    public image: SkinImage;
    public frames: number;
    public type: number;

    constructor(options: SkinAnimationData) {
        this.image = options.image;
        this.frames = options.frames;
        this.type = options.type;
    }

}
export default SkinAnimation;
