---
"404less": patch
---

The REST API under `/api/v1` accepts the same `Authorization: Bearer 404l_…` key as `/mcp`, as the /agent page documents. The key acts as its team's owner but is confined to that team: listings show only its sites and teams, and requests naming any other team are refused. Invalid keys return 401.
