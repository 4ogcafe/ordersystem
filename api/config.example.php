<?php
// Copy this file to adarsha-config.php in the directory ABOVE public_html (outside the web root on Hostinger),
// or keep as public_html/api/config.php (which is protected from public download by .htaccess).
return [
    'db_host'    => 'localhost',
    'db_name'    => 'your_db_name',
    'db_user'    => 'your_db_user',
    'db_pass'    => 'your_db_password',
    'jwt_secret' => 'your_jwt_secret_at_least_32_chars',
    // Gmail SMTP — use an App Password (Google Account → Security → App passwords), not the normal login password.
    // Port 465 = SMTPS; 587 = STARTTLS.
    'smtp_host'  => 'smtp.gmail.com',
    'smtp_port'  => 465,
    'smtp_user'  => 'baniyar208@gmail.com',
    'smtp_pass'  => '',
    'smtp_from'  => 'baniyar208@gmail.com',
    'smtp_from_name' => 'アダルサ (Adarsha)',
    // Used only when SMTP is not configured. Must be a mailbox on this Hostinger domain.
    'mail_from'  => 'noreply@adarsha.jp',
];
