-- Milk is sold from two litres per delivery up (final spec, section 5); enforced by the server.
INSERT INTO settings (key, value_json) VALUES ('minimumLitres', '2') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json;
