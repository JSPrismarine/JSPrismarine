---
'@jsprismarine/prismarine': patch
---

The server now honors `DO_NOT_TRACK` across its telemetry: setting it to any value other than `0` turns off both bStats reporting and automatic update checks. All telemetry surfaces share one opt-out helper, so later ones follow the same switch.
