# API request recipes

Copy-ready `curl` snippets for every endpoint, with the status code each one
returns. Responses use the envelope `{ success: true, data }`; errors are
`{ success: false, error: { code, message, details } }`.

```bash
BASE=https://groot.localhost      # http://localhost:3000 under PORTLESS=0
ADMIN_KEY=dev-only-admin-key      # ADMIN_AUTH_KEY (the dev default)
```

> Everything under `/api/v1` except password and passkey login needs a JWT. The
> login response sets an httpOnly `token` cookie for browsers and returns the
> token for scripts: pass it as `Authorization: Bearer $TOKEN`. User management
> uses the admin key instead (`X-Admin-Auth-Key`).

## Get a token

```bash
# 200 → { token, user: { id, email, name } }
TOKEN=$(curl -s -X POST $BASE/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo@example.com"}' | jq -r .data.token)
```

Wrong credentials → `401`; more than 20 attempts in 15 minutes → `429`.

## Health

```bash
curl $BASE/health   # 200 { status: "ok", timestamp } — 503 while shutting down
curl $BASE/ready    # 200 { ready: true }
```

## Users and sessions

```bash
# Create a user (admin key) → 201; duplicate email → 409
curl -X POST $BASE/api/v1/auth/users \
  -H "Content-Type: application/json" -H "X-Admin-Auth-Key: $ADMIN_KEY" \
  -d '{"email":"new@example.com","password":"at-least-6-chars","name":"New User"}'

# List users (admin key) → 200
curl -H "X-Admin-Auth-Key: $ADMIN_KEY" $BASE/api/v1/auth/users

# Current user (JWT) → 200
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/auth/me

# Logout (JWT; clears the cookie) → 200
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/auth/logout
```

Missing admin header → `401`; wrong key → `403`.

## Todos (JWT)

```bash
# List → 200
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/todos

# Create → 201; empty title → 400 with error.details.title
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/todos \
  -H "Content-Type: application/json" -d '{"title":"Draft documentation"}'

# Read → 200; unknown id → 404; non-numeric id → 400
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/todos/1

# Update → 200
curl -H "Authorization: Bearer $TOKEN" -X PUT $BASE/api/v1/todos/1 \
  -H "Content-Type: application/json" -d '{"completed":true}'

# Delete → 204
curl -H "Authorization: Bearer $TOKEN" -X DELETE $BASE/api/v1/todos/1
```

## Jobs (JWT)

```bash
# Queue a job → 201 { jobId, jobName, data }
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"jobName":"todo-summary","data":{},"options":{"retryLimit":1,"delaySeconds":0}}'

# Schedule with cron (nightly at 3am, optional timezone) → 201.
# Posting again for the same jobName replaces that schedule (this is how you edit one).
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/jobs/schedule \
  -H "Content-Type: application/json" \
  -d '{"jobName":"todo-cleanup","cron":"0 3 * * *","data":{"daysToKeep":45},"options":{"timezone":"UTC"}}'

# Schedules: list → 200, remove → 200 (unknown name → 404)
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/jobs/schedule
curl -H "Authorization: Bearer $TOKEN" -X DELETE $BASE/api/v1/jobs/schedule/todo-cleanup

# Dashboard queries → 200
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/jobs/stats
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/jobs/available
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/jobs?state=completed&name=todo-summary&limit=20"

# One job by id → 200; unknown → 404 JOB_NOT_FOUND
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/jobs/$JOB_ID
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/jobs/$JOB_ID/logs

# Actions → 200 { success: true }; unknown → 404; not allowed from the job's state → 400
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/jobs/$JOB_ID/retry
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/jobs/$JOB_ID/cancel
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/jobs/$JOB_ID/resume
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/jobs/$JOB_ID/rerun   # 200 { newJobId }
curl -H "Authorization: Bearer $TOKEN" -X DELETE $BASE/api/v1/jobs/$JOB_ID       # 200 { success: true }

# Bulk rerun → 200 [{ jobId, success, newJobId?, error? }]
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/jobs/bulk-rerun \
  -H "Content-Type: application/json" \
  -d '{"jobIds":["'$JOB_ID'"]}'

# Purge every job in a state → 200 { count }
curl -H "Authorization: Bearer $TOKEN" -X DELETE $BASE/api/v1/jobs/state/cancelled
```

Unknown job names are accepted: the job stays `created` until a handler with
that name is registered. A bad cron expression → `400`. Which action is
allowed from which state is listed in
[Background jobs](../features/jobs.md#lifecycle-grootjobslifecycle).

## Storage (JWT)

```bash
# List one folder level → 200 (omit folder for the root)
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/storage/files?folder=docs/"

# Upload one or more files (multipart, up to 50) into a folder
# → 200 { uploadedFiles, failedFiles }; > 100 MB → 413
curl -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf" -F "file=@notes.txt" -F "folder=docs/" \
  $BASE/api/v1/storage/files/upload

# Download → 200 raw bytes; missing → 404
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v1/storage/files/download?filePath=docs/document.pdf" -o document.pdf

# Create a folder → 200 { folderPath: "archive/2026/" }
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/storage/folders \
  -H "Content-Type: application/json" -d '{"folderPath":"archive/2026"}'

# Rename → 200 { newPath }; source missing → 404
curl -H "Authorization: Bearer $TOKEN" -X PUT $BASE/api/v1/storage/files/rename \
  -H "Content-Type: application/json" -d '{"oldPath":"docs/old.pdf","newPath":"docs/new.pdf"}'

# Delete files → 204 (missing files are ignored)
curl -H "Authorization: Bearer $TOKEN" -X DELETE $BASE/api/v1/storage/files \
  -H "Content-Type: application/json" -d '{"filePaths":["docs/document.pdf"]}'

# Delete a folder recursively → 200 { deletedCount }
curl -H "Authorization: Bearer $TOKEN" -X DELETE $BASE/api/v1/storage/folders/archive/2026
```

File and folder paths with a leading, trailing or doubled `/`, or a `.` or
`..` segment, are rejected with `400`; folder paths are normalised to `a/b/`.

## App settings (JWT)

```bash
# All settings → 200
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/settings

# One setting → 200; unknown → 404
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/settings/app-name

# Create or update → 200 { key, value, metadata: { description?, updatedAt } }
curl -H "Authorization: Bearer $TOKEN" -X PUT $BASE/api/v1/settings/app-name \
  -H "Content-Type: application/json" \
  -d '{"value":"My App","metadata":{"description":"Shown in the header"}}'

# Delete → 204; unknown → 404
curl -H "Authorization: Bearer $TOKEN" -X DELETE $BASE/api/v1/settings/app-name
```

## Passkeys

Passkey flows need the browser (`navigator.credentials`), so drive them from
`passkeyService` in the client. Endpoints and payloads are listed in
[Passkey authentication](../features/passkey-authentication.md#api-apiv1passkey);
`GET /api/v1/passkey/list` and `DELETE /api/v1/passkey/:id` (`204`) work from
`curl` with a JWT.

## Combined workflow

1. Create a few todos.
2. Queue `todo-summary`; a moment later `GET /api/v1/jobs/<id>`
   shows `state: "completed"` with the counts in `output`.
3. Schedule `todo-cleanup` nightly.
4. Open `/todos` and `/jobs` in the client to verify.
