# Complaint Submission + NLP Enrichment Scaffold (No Model Yet)

## Summary
This plan standardizes the complaint form contract, secures ticket creation for logged-in vs anonymous users, and adds a complete async NLP enrichment pipeline scaffold (with retries) without requiring DB schema changes.

NLP model accuracy is intentionally out of scope; after this work, only model logic remains to be implemented or tuned.

## Public APIs, Interfaces, and Field Contracts

### 1) Submit form contract (`Submit Complaint`)

| Field | Type | Required | Rules | Persisted |
|---|---|---|---|---|
| `title` | string | No | trim; max 120 | No (used for NLP input only) |
| `description` | string | Yes | trim; min 20, max 5000 | Yes (`tickets.description`) |
| `categoryId` | UUID | No | must be active category if present | Yes (`tickets.category_id`) |
| `guestEmail` | string(email) | Yes for anonymous only | lowercase; valid email | Yes via `guest_contacts` |
| `ticketType` | fixed | Yes | always `"Complaint"` | Yes (`tickets.ticket_type`) |

### 2) `POST /api/tickets` contract change

1. Client no longer sends `customerId`.
2. Authenticated identity is derived server-side from Supabase session cookie.
3. If authenticated and `guestEmail` is supplied, return `400`.
4. If anonymous and `guestEmail` missing or invalid, return `400`.
5. If no `categoryId`, backend uses reserved active category name `Uncategorized`.
6. Ticket is created immediately, then NLP enrichment is attempted asynchronously.
7. Response remains `201` with ticket reference; guest still receives access token.

### 3) `POST /api/nlp` structured analysis contract (adapter boundary)

Request:

```json
{
  "text": "combined title + description for NLP",
  "ticketId": "uuid-optional"
}
```

Response:

```json
{
  "sentiment": "Negative|Neutral|Positive|null",
  "detectedIntent": "string|null",
  "issueType": "string|null",
  "priority": "Low|Medium|High|null",
  "categoryName": "string|null",
  "confidence": "number|null",
  "rawOutput": "string|null"
}
```

### 4) New protected retry endpoint: `POST /api/nlp/reprocess`

1. Auth: either header secret `x-nlp-reprocess-secret` or authenticated Admin role.
2. Input: optional `ticketIds: string[]`, optional `limit` (default 25, max 100).
3. Behavior: reprocess tickets missing NLP fields.
4. Output: processed count, succeeded, failed, and per-ticket error summaries.

## End-to-End Workflow (Decision Complete)

### A) Logged-in user flow

1. User signs in through existing login flow; Supabase session cookie is set.
2. User submits complaint form with `title`, `description`, optional `categoryId`.
3. `POST /api/tickets` verifies session and sets `customer_id = auth.user.id`.
4. Ticket is inserted with clean `description` body and selected or fallback category.
5. API returns success immediately.
6. Async enrichment runs; NLP output updates `sentiment`, `detected_intent`, `issue_type`, `priority`.
7. Category update rule: if user selected category, never override.
8. If category was omitted, it starts as `Uncategorized`; NLP may replace `category_id` only while current category is still `Uncategorized`.

### B) Anonymous user flow

1. Anonymous user submits `guestEmail`, `title`, `description`, optional `categoryId`.
2. `POST /api/tickets` resolves or creates `guest_contacts` row and inserts ticket with `guest_id`.
3. Guest access token is generated and returned.
4. Ticket confirmation or tracking flow remains token-based.
5. Async NLP enrichment behavior is the same as logged-in flow.

### C) NLP failure and retry flow

1. NLP failure never blocks ticket creation.
2. Failed enrichments leave NLP columns null.
3. `POST /api/nlp/reprocess` retries pending tickets.
4. Reprocessing is safe or idempotent because updates are field-based and guarded by ticket state.

## Implementation Plan (Files and Exact Changes)

1. Update submit UI payload and validation in `frontend/app/submit/page.tsx`.
2. Remove client-side `customerId` submission and add `title` in payload.
3. Keep category optional and enforce title or description length limits.
4. Refactor ticket creation and auth ownership in `frontend/app/api/tickets/route.ts`.
5. Derive authenticated user from server session; disallow mixed identity inputs.
6. Add reserved fallback category resolver for `Uncategorized`.
7. Store only clean `description`; generate combined NLP input text internally from title plus description.
8. Add shared NLP client or normalizer utility in `frontend/lib/nlp/*` for reuse by routes.
9. Upgrade `frontend/app/api/nlp/route.ts` to structured contract output.
10. Add new `frontend/app/api/nlp/reprocess/route.ts` protected retry API.
11. Update ticket detail rendering in `frontend/app/ticket/[id]/page.tsx` to stop parsing `Title:` prefix and display stored description directly.
12. Keep guest lookup flow unchanged in `frontend/app/api/ticket/lookup/route.ts`.
13. Optionally adjust backend scaffold output shape in `backend/main.py` so `/nlp/generate` can return structured placeholders until model logic exists.
14. Document new env vars and contracts in `frontend/README.md` and `backend/README.md`.

## Test Cases and Scenarios

1. Authenticated submit succeeds without `guestEmail`; created ticket has `customer_id` set and no `guest_id`.
2. Anonymous submit without email fails with `400`.
3. Anonymous submit with valid email succeeds and returns guest token.
4. Authenticated submit that includes `guestEmail` fails with `400`.
5. Spoofed `customerId` in request body is ignored or rejected and cannot impersonate another user.
6. Category provided by user remains unchanged after enrichment.
7. Category omitted uses `Uncategorized`; enrichment may replace it.
8. NLP unavailable during submit still returns `201`; ticket remains trackable.
9. `POST /api/nlp/reprocess` reprocesses pending tickets and reports counts.
10. Unauthorized call to reprocess endpoint is rejected.
11. Guest token lookup still works for newly created guest tickets.
12. Type check passes with `npx tsc --noEmit`; smoke test key routes via manual API calls.

## Rollout and Monitoring

1. Add structured logs for ticket creation, NLP attempt start or end, and enrichment failures with `ticketId`.
2. Expose retry endpoint metrics in logs: scanned, attempted, succeeded, failed.
3. Run reprocess endpoint manually first, then schedule cron after validation.
4. Keep existing "Not Analyzed" behavior in stats as temporary visibility for pending enrichment.

## Assumptions and Defaults Locked

1. NLP runs async after ticket creation.
2. User-selected category wins.
3. Submit form keeps `title + description`.
4. DB schema changes are not allowed in this phase.
5. Retry-later behavior is required.
6. Retry trigger is protected reprocess endpoint.
7. Category is optional in submit form.
8. Blank category fallback is reserved active category `Uncategorized`.
9. Title is not persisted to DB; it is used only to construct NLP input.
10. Only missing piece after this implementation is actual NLP model inference quality.

## Supabase Access Guidance

1. Direct live Supabase introspection from this environment is not guaranteed; it depends on network access plus credentials.
2. Reliable collaboration path is to keep schema truth in repo via SQL migrations and updated schema docs.
3. Best practical setup: add migration files, generated DB types, and a periodic schema export file so planning and implementation stays accurate even without live DB access.
4. If you want direct DB-aware implementation later, provide project URL plus service role key in env and a network-enabled runtime; then the agent can validate against live schema instead of relying only on `.md`.
