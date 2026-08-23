# Postman smoke workflow

1. Start the API and run `npm run db:reset` against a fresh local database.
2. Import `local.environment.json` and select **Ticket Booking - Local Seed**.
3. Import `customer-apis.collection.json` and run requests in order:
   browse concerts -> categories -> create booking -> retry same booking ->
   voucher example -> VIP sold-out setup/rejection -> booking detail -> confirm
   or cancel. The last three requests intentionally mutate demo inventory; run
   `npm run db:reset` before repeating the complete sequence.
4. Import `operation-apis.collection.json` and run list/detail/status requests
   with the operator identity. To exercise the write workflow, run **Create
   draft concert -> Create ticket category and inventory -> Publish concert ->
   Create voucher**; the test scripts carry the generated concert/category IDs
   into the following requests.

The environment contains only stable local demo IDs; it has no password,
access token, API key or production secret. Collection test scripts populate
`concertId`, `standardCategoryId`, `bookingId`, `categoryId` and a fresh
idempotency key from responses where possible. The customer collection includes
explicit retry, voucher and sold-out assertions; the operation collection
carries generated concert/category IDs into its write workflow. The seed IDs are
stable only on a fresh database created by the current `database/seeds/seed.sql`.
