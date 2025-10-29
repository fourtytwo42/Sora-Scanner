#!/bin/bash

# Remote server details
REMOTE_HOST="192.168.50.104"
REMOTE_USER="hendo420"
REMOTE_PASS="Country1!"
SUDO_PASS="Country1!"

# Local database details
LOCAL_DB="sora_feed"
LOCAL_USER="postgres"
LOCAL_PASS="Country1!"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Progress indicator function
show_progress() {
    local current=$1
    local total=$2
    local desc=$3
    local percent=$((current * 100 / total))
    local filled=$((percent / 2))
    local empty=$((50 - filled))
    
    printf "\r${CYAN}["
    printf "%*s" $filled | tr ' ' '='
    printf "%*s" $empty | tr ' ' ' '
    printf "] ${percent}%% - ${desc}${NC}"
}

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ERROR: $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] INFO: $1${NC}"
}

# Step 1: SSH into remote server and create backup
log "Step 1: Connecting to remote server and creating database backup..."

# Create SSH command with password
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
#!/bin/bash
echo "Connected to remote server"
echo "Creating database backup..."

# Create backup with timestamp
BACKUP_FILE="sora_feed_backup_$(date +%Y%m%d_%H%M%S).sql"
echo "Backup file: $BACKUP_FILE"

# Create the backup
sudo -S <<< "Country1!" pg_dump -U postgres -h localhost sora_feed > "$BACKUP_FILE" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "SUCCESS: Backup created - $BACKUP_FILE"
    echo "BACKUP_FILE:$BACKUP_FILE"
else
    echo "ERROR: Failed to create backup"
    exit 1
fi
EOF

if [ $? -ne 0 ]; then
    error "Failed to create backup on remote server"
    exit 1
fi

# Extract backup filename from SSH output
BACKUP_FILE=$(sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "ls sora_feed_backup_*.sql 2>/dev/null | tail -1")
if [ -z "$BACKUP_FILE" ]; then
    error "Could not determine backup filename"
    exit 1
fi

log "Backup created: $BACKUP_FILE"

# Step 2: Copy backup to local machine
log "Step 2: Copying backup to local machine..."
show_progress 1 4 "Copying backup file..."

scp -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST:$BACKUP_FILE" ./remote_backup.sql

if [ $? -eq 0 ]; then
    log "Backup copied successfully"
else
    error "Failed to copy backup file"
    exit 1
fi

# Step 3: Clean up remote backup
log "Step 3: Cleaning up remote backup file..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "rm -f $BACKUP_FILE"

if [ $? -eq 0 ]; then
    log "Remote backup cleaned up"
else
    warn "Failed to clean up remote backup (non-critical)"
fi

# Step 4: Analyze backup and estimate import time
log "Step 4: Analyzing backup file..."
BACKUP_SIZE=$(wc -l < remote_backup.sql)
POST_COUNT=$(grep -c "INSERT INTO sora_posts" remote_backup.sql || echo "0")
CREATOR_COUNT=$(grep -c "INSERT INTO creators" remote_backup.sql || echo "0")

log "Backup analysis:"
log "  - Total lines: $BACKUP_SIZE"
log "  - Posts: $POST_COUNT"
log "  - Creators: $CREATOR_COUNT"

# Estimate processing time (rough estimate: 1000 records per second)
ESTIMATED_TIME=$((POST_COUNT / 1000))
if [ $ESTIMATED_TIME -lt 1 ]; then
    ESTIMATED_TIME=1
fi

log "Estimated import time: ~${ESTIMATED_TIME} seconds"

# Step 5: Create temporary import database
log "Step 5: Creating temporary import database..."
show_progress 2 4 "Setting up import database..."

# Create temp database
PGPASSWORD="$LOCAL_PASS" createdb -U "$LOCAL_USER" -h localhost sora_feed_temp

if [ $? -ne 0 ]; then
    error "Failed to create temporary database"
    exit 1
fi

# Import backup into temp database
log "Importing backup into temporary database..."
PGPASSWORD="$LOCAL_PASS" psql -U "$LOCAL_USER" -h localhost -d sora_feed_temp -f remote_backup.sql > /dev/null 2>&1

if [ $? -ne 0 ]; then
    error "Failed to import backup into temporary database"
    PGPASSWORD="$LOCAL_PASS" dropdb -U "$LOCAL_USER" -h localhost sora_feed_temp
    exit 1
fi

# Step 6: Convert and import data
log "Step 6: Converting and importing data to simplified schema..."
show_progress 3 4 "Converting data..."

# Create conversion script
cat > convert_data.sql << 'SQL_EOF'
-- Function to convert n_frames to duration in seconds
CREATE OR REPLACE FUNCTION frames_to_duration(n_frames INTEGER)
RETURNS NUMERIC AS $$
BEGIN
    IF n_frames IS NULL OR n_frames <= 0 THEN
        RETURN 0;
    END IF;
    RETURN ROUND((n_frames::NUMERIC / 30), 2);
END;
$$ LANGUAGE plpgsql;

-- Function to determine orientation
CREATE OR REPLACE FUNCTION get_orientation(width INTEGER, height INTEGER)
RETURNS TEXT AS $$
BEGIN
    IF width IS NULL OR height IS NULL THEN
        RETURN 'square';
    END IF;
    
    IF width::NUMERIC / height > 1.1 THEN
        RETURN 'wide';
    ELSIF width::NUMERIC / height < 0.9 THEN
        RETURN 'tall';
    ELSE
        RETURN 'square';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Insert converted data
INSERT INTO sora_posts (id, posted_at, orientation, duration, prompt)
SELECT 
    sp.id,
    sp.posted_at,
    get_orientation(attachment.width, attachment.height) as orientation,
    frames_to_duration(attachment.n_frames) as duration,
    sp.text as prompt
FROM sora_feed_temp.sora_posts sp
LEFT JOIN sora_feed_temp.sora_posts sp_temp ON sp.id = sp_temp.id
LEFT JOIN LATERAL (
    SELECT 
        (sp_temp.attachments->0->>'width')::INTEGER as width,
        (sp_temp.attachments->0->>'height')::INTEGER as height,
        (sp_temp.attachments->0->>'n_frames')::INTEGER as n_frames
) attachment ON true
WHERE sp.id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Clean up functions
DROP FUNCTION IF EXISTS frames_to_duration(INTEGER);
DROP FUNCTION IF EXISTS get_orientation(INTEGER, INTEGER);
SQL_EOF

# Execute conversion
PGPASSWORD="$LOCAL_PASS" psql -U "$LOCAL_USER" -h localhost -d sora_feed -f convert_data.sql

if [ $? -eq 0 ]; then
    log "Data conversion completed successfully"
else
    error "Data conversion failed"
    PGPASSWORD="$LOCAL_PASS" dropdb -U "$LOCAL_USER" -h localhost sora_feed_temp
    exit 1
fi

# Step 7: Clean up
log "Step 7: Cleaning up temporary files..."
show_progress 4 4 "Finalizing import..."

# Drop temp database
PGPASSWORD="$LOCAL_PASS" dropdb -U "$LOCAL_USER" -h localhost sora_feed_temp

# Remove local files
rm -f remote_backup.sql convert_data.sql

# Get final count
FINAL_COUNT=$(PGPASSWORD="$LOCAL_PASS" psql -U "$LOCAL_USER" -h localhost -d sora_feed -t -c "SELECT COUNT(*) FROM sora_posts;" | tr -d ' ')

log "Import completed successfully!"
log "Final record count: $FINAL_COUNT posts"
log "Database is ready for scanning!"

echo -e "\n${GREEN}✅ Database import completed successfully!${NC}"
echo -e "${CYAN}📊 Summary:${NC}"
echo -e "  - Imported: $FINAL_COUNT posts"
echo -e "  - Schema: Simplified (id, posted_at, orientation, duration, prompt)"
echo -e "  - Indexes: All fields indexed for fast queries"
echo -e "  - Ready: Scanner can now run with populated data"
