-- Voucher policy scope and auditable reservation lifecycle.
ALTER TABLE vouchers
    ADD COLUMN IF NOT EXISTS applicable_concert_id UUID REFERENCES concerts(id),
    ADD COLUMN IF NOT EXISTS applicable_ticket_category_id UUID REFERENCES ticket_categories(id);

ALTER TABLE voucher_redemptions
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'RESERVED',
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS released_reason TEXT,
    ADD CONSTRAINT voucher_redemptions_status_valid
        CHECK (status IN ('RESERVED', 'CONSUMED', 'RELEASED'));

ALTER TABLE voucher_redemptions
    DROP CONSTRAINT IF EXISTS voucher_redemptions_voucher_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_redemptions_active_user
    ON voucher_redemptions(voucher_id, user_id)
    WHERE status <> 'RELEASED';

CREATE INDEX IF NOT EXISTS idx_vouchers_applicability
    ON vouchers(applicable_concert_id, applicable_ticket_category_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_booking_status
    ON voucher_redemptions(booking_id, status);
