export enum BlockToolType {
    None = 0,
    Sword = Math.trunc(1),
    Shovel = 1 << 1,
    Pickaxe = 1 << 2,
    Axe = 1 << 3,
    Shears = 1 << 4
}
