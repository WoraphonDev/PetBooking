-- Custom migration: constraints Drizzle cannot express. NEVER edit after merge — add a new custom migration instead.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- ห้ามนัดกรูมของช่างคนเดียวกันทับเวลา (รวม buffer)
ALTER TABLE groom_appointment ADD CONSTRAINT groom_appt_groomer_no_overlap
  EXCLUDE USING gist (groomer_id WITH =, tstzrange(starts_at, blocked_until) WITH &&)
  WHERE (status NOT IN ('cancelled', 'no_show'));
--> statement-breakpoint
-- ห้ามใช้โต๊ะเดียวกันทับเวลา
ALTER TABLE groom_appointment ADD CONSTRAINT groom_appt_station_no_overlap
  EXCLUDE USING gist (station_id WITH =, tstzrange(starts_at, blocked_until) WITH &&)
  WHERE (status NOT IN ('cancelled', 'no_show'));
--> statement-breakpoint
-- ห้ามจองห้องเดียวกันทับคืน
ALTER TABLE stay ADD CONSTRAINT stay_room_no_overlap
  EXCLUDE USING gist (room_unit_id WITH =, daterange(check_in_date, check_out_date) WITH &&)
  WHERE (status IN ('reserved', 'checked_in'));
--> statement-breakpoint
-- ห้ามน้องตัวเดียวพักซ้อนกัน
ALTER TABLE stay ADD CONSTRAINT stay_pet_no_overlap
  EXCLUDE USING gist (pet_id WITH =, daterange(check_in_date, check_out_date) WITH &&)
  WHERE (status IN ('reserved', 'checked_in'));
--> statement-breakpoint
-- booking.bill_id → bill (วนอ้างกันจึงเพิ่มทีหลัง)
ALTER TABLE booking ADD CONSTRAINT booking_bill_fk FOREIGN KEY (bill_id) REFERENCES bill(id) ON DELETE SET NULL;
--> statement-breakpoint
-- append-only tables
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER booking_event_append_only BEFORE UPDATE OR DELETE ON booking_event
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER credit_ledger_append_only BEFORE UPDATE OR DELETE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER consent_record_append_only BEFORE UPDATE OR DELETE ON consent_record
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
