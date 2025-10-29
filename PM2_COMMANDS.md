# PM2 Commands for Sora Scanner

## Service Management

### View Status
```bash
pm2 status
```

### View Logs (live)
```bash
pm2 logs sora-scanner
```

### View Last 50 Lines
```bash
pm2 logs sora-scanner --lines 50 --nostream
```

### Restart Scanner
```bash
pm2 restart sora-scanner
```

### Stop Scanner
```bash
pm2 stop sora-scanner
```

### Start Scanner
```bash
pm2 start sora-scanner
```

### View Detailed Info
```bash
pm2 info sora-scanner
```

### Monitor Resource Usage
```bash
pm2 monit
```

## Configuration

### Reload with Zero Downtime
```bash
pm2 reload sora-scanner
```

### Delete from PM2
```bash
pm2 delete sora-scanner
```

### Restart All
```bash
pm2 restart all
```

## Persistence

### Save Current Process List
```bash
pm2 save
```

### Resurrect Saved Processes
```bash
pm2 resurrect
```

## Startup Configuration

### Remove Startup Script
```bash
pm2 unstartup systemd
```

### Re-enable Startup Script
```bash
sudo env PATH=$PATH:/home/hendo420/.nvm/versions/node/v24.11.0/bin /home/hendo420/.nvm/versions/node/v24.11.0/lib/node_modules/pm2/bin/pm2 startup systemd -u hendo420 --hp /home/hendo420
pm2 save
```

## Stats Dashboard

The scanner provides a web dashboard at:
```
http://localhost:4000
http://192.168.50.202:4000
```

## Quick Start

Start the scanner with PM2:
```bash
cd /home/hendo420/soraScanner
pm2 start ecosystem.config.js
pm2 save
```

## Service Status

Check if PM2 is running on boot:
```bash
systemctl status pm2-hendo420
```

Enable/disable on boot:
```bash
sudo systemctl enable pm2-hendo420
sudo systemctl disable pm2-hendo420
```

