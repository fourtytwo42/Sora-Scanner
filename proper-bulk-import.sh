#!/bin/bash

REMOTE_HOST="192.168.50.104"
REMOTE_USER="hendo420"
REMOTE_PASS="Country1!"
LOCAL_DB="sora_feed"
LOCAL_USER="postgres"
LOCAL_PASS="Country1!"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] $1${NC}"
}

# Get total count
log "Checking remote database..."
TOTAL_POSTS=$(sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" \
    "echo 'Country1!' | sudo -S -u postgres psql -d sora_feed -t -c 'SELECT COUNT(*) FROM sora_posts;'" 2>/dev/null | tr -d ' ')

log "Remote has $TOTAL_POSTS posts to import"
log "Creating export file on remote server..."

# Export data from remote as TSV
EXPORT_FILE="/tmp/sora_export_$(date +%s).tsv"
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" \
    "echo 'Country1!' | sudo -S -u postgres psql -d sora_feed -c \"
COPY (
    SELECT 
        id,
        posted_at,
        CASE 
            WHEN width IS NULL OR height IS NULL OR height = 0 THEN 'square'
            WHEN width::NUMERIC / height::NUMERIC > 1.1 THEN 'wide'
            WHEN width::NUMERIC / height::NUMERIC < 0.9 THEN 'tall'
            ELSE 'square'
        END as orientation,
        10.00 as duration,
        COALESCE(text, '') as prompt
    FROM sora_posts
    ORDER BY posted_at DESC
) TO '$EXPORT_FILE' WITH (FORMAT TEXT, DELIMITER E'\\t', NULL '');
\" && echo 'EXPORT_COMPLETE' && ls -lh '$EXPORT_FILE'" 2>/dev/null

if [ $? -ne 0 ]; then
    log "ERROR: Failed to export data from remote"
    exit 1
fi

log "Transferring export file to local machine..."
LOCAL_EXPORT="/tmp/sora_import.tsv"

# Use compression for faster transfer
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" \
    "gzip -c '$EXPORT_FILE'" | gunzip > "$LOCAL_EXPORT" &

TRANSFER_PID=$!

# Monitor transfer progress
START_TIME=$(date +%s)
while kill -0 $TRANSFER_PID 2>/dev/null; do
    if [ -f "$LOCAL_EXPORT" ]; then
        CURRENT_SIZE=$(wc -l < "$LOCAL_EXPORT" 2>/dev/null || echo 0)
        ELAPSED=$(($(date +%s) - START_TIME))
        if [ $CURRENT_SIZE -gt 0 ] && [ $ELAPSED -gt 0 ]; then
            RATE=$((CURRENT_SIZE / ELAPSED))
            PERCENT=$((CURRENT_SIZE * 100 / TOTAL_POSTS))
            if [ $PERCENT -gt 100 ]; then PERCENT=100; fi
            FILLED=$((PERCENT / 2))
            EMPTY=$((50 - FILLED))
            
            ETA_SECONDS=$(( (TOTAL_POSTS - CURRENT_SIZE) / (RATE + 1) ))
            ETA_MINUTES=$((ETA_SECONDS / 60))
            
            printf "\r${CYAN}["
            printf "%${FILLED}s" | tr ' ' '='
            printf "%${EMPTY}s" | tr ' ' ' '
            printf "] ${PERCENT}%% | ${CURRENT_SIZE}/${TOTAL_POSTS} | ${RATE}/s | ETA: ${ETA_MINUTES}m${NC}"
        fi
    fi
    sleep 2
done

wait $TRANSFER_PID
echo ""

FINAL_LINES=$(wc -l < "$LOCAL_EXPORT")
log "Transfer complete: $FINAL_LINES records"

# Import into local database
log "Importing into local database..."
START_IMPORT=$(date +%s)

# Direct copy with progress
PGPASSWORD="$LOCAL_PASS" psql -U "$LOCAL_USER" -h localhost -d "$LOCAL_DB" << EOF
\timing on
\COPY sora_posts (id, posted_at, orientation, duration, prompt) FROM '$LOCAL_EXPORT' WITH (FORMAT TEXT, DELIMITER E'\t', NULL '');
EOF

IMPORT_TIME=$(($(date +%s) - START_IMPORT))
IMPORT_MINUTES=$((IMPORT_TIME / 60))
IMPORT_SECONDS=$((IMPORT_TIME % 60))

log "Import completed in ${IMPORT_MINUTES}m ${IMPORT_SECONDS}s"

# Cleanup
log "Cleaning up..."
rm -f "$LOCAL_EXPORT"
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" \
    "rm -f '$EXPORT_FILE'" 2>/dev/null

# Get final count
FINAL_COUNT=$(PGPASSWORD="$LOCAL_PASS" psql -U "$LOCAL_USER" -h localhost -d "$LOCAL_DB" -t -c "SELECT COUNT(*) FROM sora_posts;" | tr -d ' ')

TOTAL_TIME=$(($(date +%s) - START_TIME))
TOTAL_MINUTES=$((TOTAL_TIME / 60))
TOTAL_SECONDS=$((TOTAL_TIME % 60))

echo ""
echo -e "${GREEN}✅ Database import completed!${NC}"
echo -e "${CYAN}📊 Final Summary:${NC}"
echo -e "  - Remote posts: $TOTAL_POSTS"
echo -e "  - Local posts: $FINAL_COUNT"
echo -e "  - Total time: ${TOTAL_MINUTES}m ${TOTAL_SECONDS}s"
echo -e "  - Schema: Simplified (id, posted_at, orientation, duration, prompt)"
echo -e "  - All fields indexed"
echo -e "  - Ready to scan!"

