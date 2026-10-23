-- Insert missing sanjesh quota types into saham_value_maps
INSERT INTO saham_value_maps (field, "sourceValue", "sahamTitle", "isActive") VALUES
  ('quota', 'ISARGAR_25', 'ایثارگران 25%', 1),
  ('quota', 'ISARGAR_5',  'ایثارگران 5%',  1),
  ('quota', 'ISARGAR_15', 'ایثارگران 15%', 1)
ON CONFLICT (field, "sourceValue") DO NOTHING;