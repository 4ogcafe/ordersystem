<?php
// Copy this file to adarsha-config.php in the directory ABOVE public_html (outside the web root on Hostinger),
// or keep as public_html/api/config.php (which is protected from public download by .htaccess).
return [
    'db_host'    => 'localhost',
    'db_name'    => 'your_db_name',
    'db_user'    => 'your_db_user',
    'db_pass'    => 'your_db_password',
    'jwt_secret' => 'your_jwt_secret_at_least_32_chars',
];
