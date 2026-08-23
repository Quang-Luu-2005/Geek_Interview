# ADR-003: Reserve Inventory with an Atomic Conditional Update

## Status

Accepted

## Decision

Reserve inventory with a single conditional statement inside the booking
transaction:

```sql
UPDATE ticket_inventories
SET available_quantity = available_quantity - :quantity,
    updated_at = NOW()
WHERE ticket_category_id = :category_id
  AND available_quantity >= :quantity
RETURNING ticket_category_id, available_quantity;
```

The use case treats zero returned rows as the stable
`INSUFFICIENT_TICKET_INVENTORY` business error. It never reads stock, calculates a new value in application
memory, and then writes it back.

## Consequences

The database serializes competing writes to the same inventory row and the
`CHECK (available_quantity >= 0)` constraint is a second line of defense. A
multi-category request sorts category IDs before updates. If any category or
the voucher step fails, the transaction rolls back every prior reservation.

The trade-off is that hot concert rows can become contention points. That is
measured in the concurrency/load tests before introducing sharding, queues, or
reservation partitioning.
