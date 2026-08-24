#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE irctc_user_db;
    CREATE DATABASE irctc_admin_db;
    CREATE DATABASE irctc_inventory_db;
    CREATE DATABASE irctc_booking_db;
    CREATE DATABASE irctc_payment_db;
EOSQL
