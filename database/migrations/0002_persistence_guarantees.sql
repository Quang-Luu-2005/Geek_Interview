-- Cross-column and lifecycle checks that cannot be expressed by the initial
-- table shape alone. This migration is intentionally separate so existing
-- environments can upgrade without rewriting migration history.

ALTER TABLE bookings
    ADD CONSTRAINT bookings_discount_not_above_subtotal
        CHECK (discount_amount <= subtotal),
    ADD CONSTRAINT bookings_final_amount_matches_snapshot
        CHECK (final_amount = subtotal - discount_amount);

ALTER TABLE booking_items
    ADD CONSTRAINT booking_items_line_total_matches_snapshot
        CHECK (line_total = unit_price * quantity);

ALTER TABLE vouchers
    ADD CONSTRAINT vouchers_percent_discount_is_bounded
        CHECK (discount_type <> 'PERCENT' OR discount_value <= 100);

ALTER TABLE booking_status_history
    ADD CONSTRAINT booking_status_history_from_status_valid
        CHECK (from_status IS NULL OR from_status IN ('RESERVED', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
    ADD CONSTRAINT booking_status_history_to_status_valid
        CHECK (to_status IN ('RESERVED', 'CONFIRMED', 'EXPIRED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_vouchers_status_expires_at
    ON vouchers(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_records_status_updated_at
    ON idempotency_records(status, updated_at);
