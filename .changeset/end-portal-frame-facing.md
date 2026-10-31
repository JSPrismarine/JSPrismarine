---
"@jsprismarine/block-behaviors": patch
---

Face a placed `end_portal_frame` opposite its placer, Java's `EndPortalFrameBlock.getStateForPlacement` rule. Every frame used to keep the default `south` facing, so twelve placed frames could never form the inward-facing ring and the end portal could not be created in creative.
