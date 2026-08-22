# Security assumptions and API boundary

Task 10 keeps the assessment executable without introducing an identity provider.
The current identity boundary is therefore deliberately explicit:

- `x-user-id` must be a UUID for every customer or operations request.
- The value is looked up in `users`; customer endpoints require `CUSTOMER`, while
  `/api/admin/**` requires `OPERATOR` or `ADMIN`.
- Booking reads and state changes always include the authenticated customer in
  the SQL predicate. A different customer's booking is reported as `404`.
- This header is a development/test simplification, not a production
  authentication mechanism. A real deployment should replace it with a signed
  access token (JWT or an API gateway identity), keep the same ownership checks,
  and derive the user ID from verified claims.

The API does not contain production credentials or hard-coded secrets. Database
credentials and operational limits are environment variables; `.env.example`
contains placeholders/defaults only. `X-Request-ID` is generated when absent,
validated for safe characters, and returned on every response.

Error responses use the same shape for authentication, authorization,
validation, business conflicts, and unexpected failures:

```json
{
  "code": "FORBIDDEN",
  "message": "An operator or admin role is required",
  "traceId": "a-request-id"
}
```

Unexpected errors never include stack traces or database exception details.
`Idempotency-Key` remains required for booking creation and is scoped to the
customer identity and request fingerprint.
