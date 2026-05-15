# Supabase / BigQuery log query troubleshooting

## `Field name response does not exist`

If Supabase Log Explorer, BigQuery, or another log analytics view returns an error similar to:

```json
{
  "code": 400,
  "status": "INVALID_ARGUMENT",
  "message": "Field name response does not exist in STRUCT<auth_audit_event ARRAY<STRUCT<action STRING, actor_id STRING, actor_username STRING, ...>>, host STRING, level STRING, ...>"
}
```

BigQuery is telling you that the query references a nested field named `response`, but the row being queried has a `metadata`/payload struct with fields such as `auth_audit_event`, `host`, and `level` instead. In BigQuery, missing struct fields are a query compilation error; they are not returned as `NULL` automatically.

## How to fix the query

1. Remove direct field references such as `metadata.response`, `payload.response`, or `response` unless the selected log table actually exposes that field.
2. Inspect the available fields first:

   ```sql
   SELECT
     metadata,
     payload
   FROM `project.dataset.logs`
   LIMIT 10;
   ```

3. For Supabase auth audit events, query the `auth_audit_event` array instead of `response`:

   ```sql
   SELECT
     timestamp,
     event.action,
     event.actor_id,
     event.actor_username,
     metadata.host,
     metadata.level
   FROM `project.dataset.logs`,
   UNNEST(metadata.auth_audit_event) AS event
   WHERE ARRAY_LENGTH(metadata.auth_audit_event) > 0
   ORDER BY timestamp DESC
   LIMIT 100;
   ```

4. If a field is stored inside a JSON string rather than a BigQuery `STRUCT`, extract it with `JSON_VALUE` instead of dot notation:

   ```sql
   SELECT
     JSON_VALUE(json_payload, '$.response') AS response
   FROM `project.dataset.logs`
   WHERE JSON_VALUE(json_payload, '$.response') IS NOT NULL
   LIMIT 100;
   ```

## App-side checklist

This repository connects to Supabase/PostgreSQL through the `pg` driver, so this BigQuery error is usually produced by a dashboard/log query rather than by the application SQL routes. Verify the following before changing app code:

- The application database variables point to the PostgreSQL connection string (`postgresql://...`) rather than a Supabase REST, analytics, or BigQuery endpoint.
- The Supabase Log Explorer query does not include `response` unless the selected log source documents that field.
- Auth audit queries unnest `auth_audit_event` when they need action or actor details.
