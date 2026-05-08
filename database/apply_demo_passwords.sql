-- Fixes password_hash columns to SHA-256(hex) for plaintext password: password
-- Matches Flask login: hashlib.sha256(password.encode()).hexdigest()
-- Run once if you imported an older Database_code.sql with plain strings in password_hash.
--
-- If `mysql` CLI is not installed (zsh: command not found: mysql), run instead:
--   cd back-end/back-end && pip install -r requirements.txt && python3 ../../database/apply_demo_passwords.py
--
USE LOGISTICS_COMPANY;

UPDATE ADMIN
SET password_hash = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
WHERE admin_id IN (99991, 99992, 99993, 99994, 99995);

UPDATE CUSTOMER
SET password_hash = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    email = 'customer@example.com'
WHERE customer_id = 8;

UPDATE DRIVER
SET password_hash = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    email = 'driver@example.com'
WHERE driver_id = 2001;
