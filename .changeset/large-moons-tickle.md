---
'@jsprismarine/bedrock-data': patch
---

Run the capture job's host-side halves under the same `tsx` resolver the server starts under, so
the `palette` and `packets` passes can reach workspace packages. Both died on an import before
doing any work, because a workspace package resolves to TypeScript sources whose relative imports
carry no file extension.
