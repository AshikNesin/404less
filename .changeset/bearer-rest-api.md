---
"404less": patch
---

The REST API under `/api/v1` accepts the same `Authorization: Bearer 404l_…` key as `/mcp`, as the /agent page documents: the key acts as its team's owner (site creation without a `teamId` lands in the key's team). The groot migration had left only the session-cookie path, so the documented curl returned 401.
