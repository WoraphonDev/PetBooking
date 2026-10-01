-- Seed vaccine_type from docs/spec/vectors/reference-data.json (10 §1). Idempotent.
INSERT INTO "vaccine_type" ("code", "species", "name_th", "name_en", "default_validity_months", "sort_order") VALUES
  ('DOG_RABIES', 'dog', 'พิษสุนัขบ้า', 'Rabies', 12, 1),
  ('DOG_DHPPL', 'dog', 'วัคซีนรวมสุนัข (ไข้หัด ตับอักเสบ ลำไส้อักเสบ พาราอินฟลูเอนซา เลปโตสไปโรซิส)', 'DHPPL', 12, 2),
  ('DOG_KENNEL_COUGH', 'dog', 'ไอกรนสุนัข (Kennel cough)', 'Bordetella', 12, 3),
  ('CAT_RABIES', 'cat', 'พิษสุนัขบ้า', 'Rabies', 12, 1),
  ('CAT_FVRCP', 'cat', 'วัคซีนรวมแมว (ไข้หัดแมว หวัดแมว)', 'FVRCP', 12, 2),
  ('CAT_FELV', 'cat', 'ลิวคีเมียแมว', 'FeLV', 12, 3)
ON CONFLICT ("code") DO NOTHING;
