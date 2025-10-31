# Read-Only Database User

A read-only PostgreSQL user (`sora_readonly`) has been created for safe website access. This user can only read data and cannot modify or delete anything.

## User Details

- **Username:** `sora_readonly`
- **Password:** Set via `DB_READONLY_PASSWORD` environment variable, or defaults to `sora_readonly_password_change_me`

## Permissions

✅ **Allowed:**
- SELECT on all tables (current and future)
- CONNECT to the database
- View table structures and schema information

❌ **Not Allowed:**
- INSERT, UPDATE, DELETE, TRUNCATE
- CREATE, DROP, ALTER tables
- Any schema modifications

## Setup

The read-only user is automatically created when you run:

```bash
npm run setup
```

Or you can create it manually using the SQL script:

```bash
psql -U postgres -d sora_feed -f scripts/create-readonly-user.sql
```

**Important:** Before using in production, change the password:

```sql
ALTER USER sora_readonly WITH PASSWORD 'your_secure_password_here';
```

## Usage in Your Website

### Connection String Example

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sora_feed',
  user: 'sora_readonly',
  password: process.env.DB_READONLY_PASSWORD || 'sora_readonly_password_change_me'
});
```

### Environment Variables

Add to your `.env`:

```env
DB_READONLY_PASSWORD=your_secure_readonly_password
```

## Testing the Read-Only User

Test that the user works and is truly read-only:

```bash
# Connect as readonly user
psql -U sora_readonly -d sora_feed

# Try to SELECT (should work)
SELECT COUNT(*) FROM sora_posts;

# Try to INSERT (should fail)
INSERT INTO sora_posts (id, posted_at, orientation, duration) 
VALUES ('test', 1234567890, 'wide', 10.0);
# ERROR: permission denied for table sora_posts
```

## Security Notes

- The read-only user cannot access other databases
- Future tables automatically get SELECT permission
- No write operations are possible, even if your website code has bugs
- Safe to expose in website configuration without risk of data loss

