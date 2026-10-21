-- A volatile expression in an UPDATE target list can be evaluated before the
-- command finishes waiting for a row lock. A BEFORE UPDATE trigger runs while
-- the row is already locked, so clock_timestamp() represents the effective
-- status transition rather than the beginning of the transaction or wait.
CREATE FUNCTION set_service_order_completed_at() RETURNS trigger AS $$
BEGIN
    IF OLD."status" <> 'COMPLETED' AND NEW."status" = 'COMPLETED' THEN
        NEW."completedAt" := clock_timestamp();
    ELSIF NEW."status" <> 'COMPLETED' THEN
        NEW."completedAt" := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_service_order_completed_at_trigger
BEFORE UPDATE OF "status" ON "ServiceOrder"
FOR EACH ROW EXECUTE FUNCTION set_service_order_completed_at();
