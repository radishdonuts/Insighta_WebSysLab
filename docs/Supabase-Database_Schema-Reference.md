# Insighta – Supabase Database Schema Reference

> **Purpose**: This document describes every table, column, enum, function, and trigger in the Insighta Supabase project so that developers and AI assistants can understand the data model without needing direct database access.

---

## Table of Contents

1. [Enumerated Types](#enumerated-types)
2. [Tables](#tables)
   - [profiles](#profiles)
   - [guest_contacts](#guest_contacts)
   - [complaint_categories](#complaint_categories)
   - [tickets](#tickets)
   - [attachments](#attachments)
   - [ticket_status_history](#ticket_status_history)
   - [ticket_access_tokens](#ticket_access_tokens)
   - [notifications](#notifications)
   - [feedback](#feedback)
   - [system_activity_logs](#system_activity_logs)
3. [Database Functions](#database-functions)
   - [sha256_hex](#sha256_hex)
   - [set_updated_at](#set_updated_at)
   - [set_last_updated_at](#set_last_updated_at)
   - [handle_new_user](#handle_new_user)
   - [guest_ticket_lookup](#guest_ticket_lookup)
4. [Triggers](#triggers)
5. [Relationships (ER Summary)](#relationships-er-summary)

---

## Enumerated Types

| Enum Name          | Purpose                                  | Values (confirmed from Supabase UI)                                         |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| `user_role`        | Role assigned to a profile               | `Customer`, `Staff`, `Admin`                                                |
| `ticket_type`      | The type/channel of a ticket             | `Complaint`, `Feedback`                                                     |
| `ticket_status`    | Lifecycle status of a ticket             | `Under Review`, `In Progress`, `Pending Customer Response`, `Resolved`, `Closed` |
| `delivery_status`  | Notification delivery state              | `Pending`, `Sent`, `Failed`                                                 |
| `ticket_priority`  | Urgency level of a ticket                | `Low`, `Medium`, `High`                                                     |
| `sentiment_label`  | NLP-detected sentiment of the complaint  | `Negative`, `Neutral`, `Positive`                                           |

> All enums are `USER-DEFINED` PostgreSQL types in the `public` schema.

---

## Tables

### profiles

Mirrors Supabase Auth users. A row is auto-created via the `handle_new_user` trigger function whenever a new user signs up.

| Column         | Type                       | Nullable | Default                          | Notes                                          |
| -------------- | -------------------------- | -------- | -------------------------------- | ---------------------------------------------- |
| `id`           | `uuid`                     | **NO**   | `gen_random_uuid()`              | PK – also FK → `auth.users(id)`               |
| `email`        | `text`                     | **NO**   | —                                | Unique                                         |
| `first_name`   | `text`                     | YES      | —                                |                                                |
| `last_name`    | `text`                     | YES      | —                                |                                                |
| `role`         | `user_role`                | **NO**   | `'Customer'::user_role`          |                                                |
| `is_active`    | `boolean`                  | **NO**   | —                                |                                                |
| `created_at`   | `timestamptz`              | **NO**   | —                                |                                                |
| `last_login_at`| `timestamptz`              | YES      | —                                |                                                |

**Constraints**

- `profiles_pkey` – PRIMARY KEY (`id`)
- `profiles_id_fkey` – FOREIGN KEY (`id`) → `auth.users(id)`
- Unique on `email`

**RLS / Policies**

- Row Level Security should be **enabled** on `profiles`.
- Authenticated users should be allowed to read **their own** profile row (required for frontend middleware / RBAC checks).

```sql
alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());
```

---

### guest_contacts

Stores email addresses of unauthenticated (guest) users who submit complaints.

| Column       | Type            | Nullable | Default             |
| ------------ | --------------- | -------- | ------------------- |
| `id`         | `uuid`          | **NO**   | `gen_random_uuid()` |
| `email`      | `text`          | **NO**   | —                   |
| `created_at` | `timestamptz`   | **NO**   | `now()`             |

**Constraints**

- `guest_contacts_pkey` – PRIMARY KEY (`id`)

---

### complaint_categories

Lookup table for complaint/ticket categories (e.g. "Claim Denial", "Billing", "Policy Cancellation").

| Column          | Type          | Nullable | Default             |
| --------------- | ------------- | -------- | ------------------- |
| `id`            | `uuid`        | **NO**   | `gen_random_uuid()` |
| `category_name` | `text`        | **NO**   | —                   |
| `is_active`     | `boolean`     | **NO**   | `true`              |
| `created_at`    | `timestamptz` | **NO**   | `now()`             |
| `updated_at`    | `timestamptz` | **NO**   | `now()`             |

**Constraints**

- `complaint_categories_pkey` – PRIMARY KEY (`id`)

**Triggers**

- `trg_complaint_categories_...` → calls `set_updated_at()` BEFORE UPDATE to auto-set `updated_at`.

---

### tickets

Central table – every complaint or inquiry is stored here.

| Column              | Type              | Nullable | Default                             | Notes                                                    |
| ------------------- | ----------------- | -------- | ----------------------------------- | -------------------------------------------------------- |
| `id`                | `uuid`            | **NO**   | `gen_random_uuid()`                 | PK                                                       |
| `ticket_number`     | `text`            | **NO**   | —                                   | Unique human-readable reference (e.g. `TKT-00012`)       |
| `ticket_type`       | `ticket_type`     | **NO**   | —                                   | Enum – complaint, inquiry, etc.                          |
| `submitted_at`      | `timestamptz`     | **NO**   | `now()`                             |                                                          |
| `status`            | `ticket_status`   | **NO**   | `'Under Review'::ticket_status`     |                                                          |
| `priority`          | `ticket_priority` | **NO**   | `'Medium'::ticket_priority`         |                                                          |
| `description`       | `text`            | **NO**   | —                                   | Free-text complaint body                                 |
| `sentiment`         | `sentiment_label` | YES      | —                                   | Populated by the NLP pipeline                            |
| `detected_intent`   | `text`            | YES      | —                                   | NLP-detected intent                                      |
| `issue_type`        | `text`            | YES      | —                                   | NLP-detected issue type                                  |
| `category_id`       | `uuid`            | **NO**   | —                                   | FK → `complaint_categories(id)`                          |
| `customer_id`       | `uuid`            | YES      | —                                   | FK → `profiles(id)` – set when submitter is logged in    |
| `guest_id`          | `uuid`            | YES      | —                                   | FK → `guest_contacts(id)` – set when submitter is guest  |
| `assigned_staff_id` | `uuid`            | YES      | —                                   | FK → `profiles(id)` – the agent/staff assigned           |
| `last_updated_at`   | `timestamptz`     | **NO**   | `now()`                             | Auto-updated via trigger                                 |

**Constraints**

- `tickets_pkey` – PRIMARY KEY (`id`)
- Unique on `ticket_number`
- `tickets_category_id_fkey` → `complaint_categories(id)`
- `tickets_customer_id_fkey` → `profiles(id)`
- `tickets_guest_id_fkey` → `guest_contacts(id)`
- `tickets_assigned_staff_id_fkey` → `profiles(id)`

**Triggers**

- `trg_tickets_last_updated_at` → calls `set_last_updated_at()` BEFORE UPDATE to auto-set `last_updated_at`.

---

### attachments

Files uploaded alongside a ticket (stored in Supabase Storage; this table holds metadata).

| Column        | Type          | Nullable | Default             | Notes                                    |
| ------------- | ------------- | -------- | ------------------- | ---------------------------------------- |
| `id`          | `uuid`        | **NO**   | `gen_random_uuid()` | PK                                       |
| `ticket_id`   | `uuid`        | **NO**   | —                   | FK → `tickets(id)`                       |
| `file_name`   | `text`        | **NO**   | —                   | Original file name                       |
| `file_type`   | `text`        | YES      | —                   | MIME type                                |
| `file_path`   | `text`        | **NO**   | —                   | Path inside the Supabase Storage bucket  |
| `uploaded_at` | `timestamptz` | **NO**   | `now()`             |                                          |

**Constraints**

- `attachments_pkey` – PRIMARY KEY (`id`)
- `attachments_ticket_id_fkey` → `tickets(id)`

---

### ticket_status_history

Audit log of every status change on a ticket.

| Column              | Type            | Nullable | Default             | Notes                        |
| ------------------- | --------------- | -------- | ------------------- | ---------------------------- |
| `id`                | `uuid`          | **NO**   | `gen_random_uuid()` | PK                           |
| `ticket_id`         | `uuid`          | **NO**   | —                   | FK → `tickets(id)`           |
| `old_status`        | `ticket_status` | **NO**   | —                   |                              |
| `new_status`        | `ticket_status` | **NO**   | —                   |                              |
| `changed_by_user_id`| `uuid`          | **NO**   | —                   | FK → `profiles(id)`          |
| `changed_at`        | `timestamptz`   | **NO**   | `now()`             |                              |
| `remarks`           | `text`          | YES      | —                   | Optional note about the change |

**Constraints**

- `ticket_status_history_pkey` – PRIMARY KEY (`id`)
- `ticket_status_history_ticket_id_fkey` → `tickets(id)`
- `ticket_status_history_changed_by_user_id_fkey` → `profiles(id)`

---

### ticket_access_tokens

Allows unauthenticated (guest) users to view their ticket via a secret URL token. Tokens are stored **hashed** (SHA-256).

| Column       | Type          | Nullable | Default             | Notes                              |
| ------------ | ------------- | -------- | ------------------- | ---------------------------------- |
| `id`         | `uuid`        | **NO**   | `gen_random_uuid()` | PK                                 |
| `ticket_id`  | `uuid`        | **NO**   | —                   | FK → `tickets(id)`                 |
| `token_hash` | `text`        | **NO**   | —                   | SHA-256 hex digest of raw token; Unique |
| `created_at` | `timestamptz` | **NO**   | `now()`             |                                    |
| `expires_at` | `timestamptz` | YES      | —                   | NULL = never expires               |
| `used_at`    | `timestamptz` | YES      | —                   | Tracks last usage time             |

**Constraints**

- `ticket_access_tokens_pkey` – PRIMARY KEY (`id`)
- Unique on `token_hash`
- `ticket_access_tokens_ticket_id_fkey` → `tickets(id)`

---

### notifications

Log of all notifications sent (email, in-app, etc.) related to tickets.

| Column             | Type          | Nullable | Default             | Notes                           |
| ------------------ | ------------- | -------- | ------------------- | ------------------------------- |
| `id`               | `uuid`        | **NO**   | `gen_random_uuid()` | PK                              |
| `ticket_id`        | `uuid`        | **NO**   | —                   | FK → `tickets(id)`              |
| `recipient_email`  | `text`        | **NO**   | —                   |                                 |
| `notification_type`| `text`        | **NO**   | —                   | e.g. `status_change`, `created` |
| `message`          | `text`        | **NO**   | —                   | Notification body               |
| `sent_at`          | `timestamptz` | **NO**   | `now()`             |                                 |
| `delivery_status`  | `text`        | **NO**   | `'sent'`            | e.g. `sent`, `failed`           |

**Constraints**

- `notifications_pkey` – PRIMARY KEY (`id`)
- `notifications_ticket_id_fkey` → `tickets(id)`

---

### feedback

Customer satisfaction feedback for a resolved ticket (one feedback per ticket).

| Column                | Type          | Nullable | Default             | Notes                                  |
| --------------------- | ------------- | -------- | ------------------- | -------------------------------------- |
| `id`                  | `uuid`        | **NO**   | `gen_random_uuid()` | PK                                     |
| `ticket_id`           | `uuid`        | **NO**   | —                   | FK → `tickets(id)`; Unique             |
| `rating`              | `integer`     | **NO**   | —                   | CHECK: `1 ≤ rating ≤ 5`               |
| `comment`             | `text`        | YES      | —                   |                                        |
| `submitted_at`        | `timestamptz` | **NO**   | `now()`             |                                        |
| `submitted_by_user_id`| `uuid`        | YES      | —                   | FK → `profiles(id)` (logged-in user)   |
| `submitted_by_guest_id`| `uuid`       | YES      | —                   | FK → `guest_contacts(id)` (guest user) |

**Constraints**

- `feedback_pkey` – PRIMARY KEY (`id`)
- Unique on `ticket_id` (one feedback per ticket)
- `feedback_ticket_id_fkey` → `tickets(id)`
- `feedback_submitted_by_user_id_fkey` → `profiles(id)`
- `feedback_submitted_by_guest_id_fkey` → `guest_contacts(id)`

---

### system_activity_logs

General audit / activity log for the application.

| Column        | Type          | Nullable | Default             | Notes                                 |
| ------------- | ------------- | -------- | ------------------- | ------------------------------------- |
| `id`          | `uuid`        | **NO**   | `gen_random_uuid()` | PK                                    |
| `user_id`     | `uuid`        | YES      | —                   | FK → `profiles(id)` (nullable for system events) |
| `action`      | `text`        | **NO**   | —                   | e.g. `login`, `ticket_created`        |
| `entity_type` | `text`        | **NO**   | —                   | e.g. `ticket`, `profile`              |
| `entity_id`   | `uuid`        | YES      | —                   |                                       |
| `timestamp`   | `timestamptz` | **NO**   | `now()`             |                                       |
| `ip_address`  | `text`        | YES      | —                   |                                       |

**Constraints**

- `system_activity_logs_pkey` – PRIMARY KEY (`id`)
- `system_activity_logs_user_id_fkey` → `profiles(id)`

---

## Database Functions

### sha256_hex

| Property    | Value                                                |
| ----------- | ---------------------------------------------------- |
| **Schema**  | `public`                                             |
| **Language**| SQL                                                  |
| **Args**    | `input text`                                         |
| **Returns** | `text`                                               |
| **Security**| Invoker                                              |

**Definition**

```sql
select encode(digest(input, 'sha256'), 'hex');
```

> Requires the `pgcrypto` extension. Used to hash guest access tokens before storage/comparison.

---

### set_updated_at

| Property    | Value                        |
| ----------- | ---------------------------- |
| **Schema**  | `public`                     |
| **Language**| PL/pgSQL                     |
| **Args**    | *(none)*                     |
| **Returns** | `trigger`                    |
| **Security**| Invoker                      |

**Definition**

```plpgsql
begin
  new.updated_at = now();
  return new;
end;
```

> Used by the `complaint_categories` table trigger to auto-refresh `updated_at` on every UPDATE.

---

### set_last_updated_at

| Property    | Value                        |
| ----------- | ---------------------------- |
| **Schema**  | `public`                     |
| **Language**| PL/pgSQL                     |
| **Args**    | *(none)*                     |
| **Returns** | `trigger`                    |
| **Security**| Invoker                      |

**Definition**

```plpgsql
begin
  new.last_updated_at = now();
  return new;
end;
```

> Used by the `tickets` table trigger to auto-refresh `last_updated_at` on every UPDATE.

---

### handle_new_user

| Property    | Value                        |
| ----------- | ---------------------------- |
| **Schema**  | `public`                     |
| **Language**| PL/pgSQL                     |
| **Args**    | *(none)*                     |
| **Returns** | `trigger`                    |
| **Security**| Definer                      |

**Definition**

```plpgsql
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    role,
    is_active,
    created_at,
    last_login_at
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    'Customer'::user_role,
    true,
    now(),
    null
  )
  on conflict (id) do update
    set email = excluded.email,
        first_name = excluded.first_name,
        last_name = excluded.last_name;

  return new;
end;
```

> Attached as a trigger on `auth.users` (AFTER INSERT). Automatically creates a `profiles` row when a new Supabase Auth user signs up. Reads `first_name` and `last_name` from the user's `raw_user_meta_data` JSON.

---

### guest_ticket_lookup

| Property    | Value                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| **Schema**  | `public`                                                                                   |
| **Language**| PL/pgSQL                                                                                   |
| **Args**    | `p_token text`                                                                             |
| **Returns** | `TABLE(ticket_id uuid, ticket_number text, ticket_type text, submitted_at timestamptz, status text, priority text, category_name text, description text, last_updated_at timestamptz)` |
| **Security**| Definer                                                                                    |

**Definition**

```plpgsql
declare
  v_hash text;
begin
  -- 1) Hash the raw token from the guest URL.
  v_hash := public.sha256_hex(p_token);

  -- 2) Validate the token exists and is not expired.
  --    If this check fails, we return 0 rows (guest sees "invalid/expired link").
  if not exists (
    select 1
    from public.ticket_access_tokens t
    where t.token_hash = v_hash
      and (t.expires_at is null or t.expires_at > now())
  ) then
    return;
  end if;

  -- 3) Track usage: update used_at to "last used time"
  update public.ticket_access_tokens
    set used_at = now()
  where token_hash = v_hash;

  -- 4) Return ticket details (SAFE subset) + category name
  return query
  select
    tk.id,
    tk.ticket_number,
    tk.ticket_type::text,       -- cast enum to text for easy display
    tk.submitted_at,
    tk.status::text,            -- cast enum to text
    tk.priority::text,          -- cast enum to text
    cc.category_name,
    tk.description,
    tk.last_updated_at
  from public.ticket_access_tokens at
  join public.tickets tk on tk.id = at.ticket_id
  join public.complaint_categories cc on cc.id = tk.category_id
  where at.token_hash = v_hash
    and (at.expires_at is null or at.expires_at > now());
end;
```

> Called from the application when a guest accesses `/track?token=<raw_token>`. The raw token is hashed with `sha256_hex`, validated against `ticket_access_tokens`, and then the corresponding ticket details (with category name joined) are returned. Enum columns are cast to `text` for convenience. The function also updates `used_at` to track when the token was last accessed.

---

## Triggers

| Trigger Name                        | Table                  | Function              | Timing         | Event    | Orientation |
| ----------------------------------- | ---------------------- | --------------------- | -------------- | -------- | ----------- |
| `trg_complaint_categories_...`      | `complaint_categories` | `set_updated_at`      | BEFORE         | UPDATE   | ROW         |
| `trg_tickets_last_updated_at`       | `tickets`              | `set_last_updated_at` | BEFORE         | UPDATE   | ROW         |
| *(on `auth.users` – Supabase-managed)* | `auth.users`        | `handle_new_user`     | AFTER          | INSERT   | ROW         |

> The `handle_new_user` trigger is attached to the Supabase Auth `auth.users` table and is not visible in the public schema triggers list, but it is a `public` schema function called automatically on signup.

---

## Relationships (ER Summary)

```
auth.users
  └─── profiles (1:1 via id)
          ├─── tickets.customer_id (1:N)
          ├─── tickets.assigned_staff_id (1:N)
          ├─── ticket_status_history.changed_by_user_id (1:N)
          ├─── feedback.submitted_by_user_id (1:N)
          └─── system_activity_logs.user_id (1:N)

guest_contacts
  ├─── tickets.guest_id (1:N)
  └─── feedback.submitted_by_guest_id (1:N)

complaint_categories
  └─── tickets.category_id (1:N)

tickets
  ├─── attachments.ticket_id (1:N)
  ├─── ticket_status_history.ticket_id (1:N)
  ├─── ticket_access_tokens.ticket_id (1:N)
  ├─── notifications.ticket_id (1:N)
  └─── feedback.ticket_id (1:1)
```

### Key Design Decisions

- **Dual submitter model**: A ticket can be submitted by either a **logged-in user** (`customer_id` → `profiles`) or a **guest** (`guest_id` → `guest_contacts`). Exactly one should be non-null.
- **Token-based guest access**: Raw tokens are given to guests via email; only the SHA-256 hash is stored. The `guest_ticket_lookup` function handles validation, expiry checking, and usage tracking in one RPC call.
- **NLP enrichment**: The `sentiment`, `detected_intent`, and `issue_type` columns on `tickets` are populated asynchronously by the FastAPI NLP backend after submission.
- **One feedback per ticket**: Enforced by the unique constraint on `feedback.ticket_id`.
- **Auto-timestamps**: `updated_at` and `last_updated_at` are managed by BEFORE UPDATE triggers, so application code does not need to set them manually.
