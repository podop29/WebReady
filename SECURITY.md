# WebReady Security Measures

## Overview

WebReady has multiple layers of protection against abuse and security threats.

## Implemented Protections

### 1. Rate Limiting

**Single Image Processing (`/process`)**
- **Limit:** 20 requests per 15 minutes per IP address
- **Purpose:** Prevent API spam and resource exhaustion
- **Error:** `429 Too Many Requests` - "Too many requests, please try again later."

**Batch Processing (`/process-batch`)**
- **Limit:** 10 requests per hour per IP address
- **Purpose:** Stricter limit due to higher resource usage
- **Error:** `429 Too Many Requests` - "Batch processing limit reached. Please try again in an hour."

**Why these limits:**
- Allows legitimate users to process images freely
- Prevents automated abuse
- Protects server resources and hosting costs
- One person processing 10 batches/hour = 500 images/hour (very generous)

### 2. File Size Limits

**Per File:**
- Maximum: 25MB
- Error: `413 Payload Too Large` - "File too large. Maximum size is 25MB per file."

**Per Request:**
- Maximum files: 50
- Maximum field size: 10MB
- Error: `413 Payload Too Large` - "Too many files. Maximum is 50 files per batch."

**Protection against:**
- Memory exhaustion attacks
- Bandwidth abuse
- Server crashes from oversized files

### 3. Security Headers (Helmet.js)

Automatically added headers:
- `X-DNS-Prefetch-Control: off`
- `X-Frame-Options: SAMEORIGIN` (prevents clickjacking)
- `X-Content-Type-Options: nosniff` (prevents MIME sniffing)
- `X-Download-Options: noopen`
- `X-XSS-Protection: 0`
- `Strict-Transport-Security` (HTTPS only, when deployed)

### 4. CORS Protection

**Allowed origins:**
- `http://localhost:3000` (development)
- `http://localhost:5500` (VS Code Live Server)
- Your production domain (add when deployed)

**Protection against:**
- Unauthorized API access from random websites
- Cross-origin resource abuse

### 5. Input Validation

**File Type Validation:**
- Only accepts: JPG, PNG, WebP
- Validates via Sharp metadata parsing

**Dimension Validation:**
- Refuses to upscale images beyond original size
- Prevents quality degradation attacks

**Width Validation:**
- Only processes valid numeric widths
- Skips invalid/malicious input

### 6. Memory Management

**In-Memory Processing:**
- No files written to disk
- Memory is freed after each request
- Prevents disk space exhaustion

**Sharp Processing:**
- Efficient C++ bindings
- Automatic cleanup after errors

### 7. Error Handling

**Graceful Failures:**
- All errors caught and logged
- Proper HTTP status codes
- No sensitive information leaked
- Server continues running after errors

**Multer Error Handling:**
- File size limits
- File count limits
- Field size limits
- Malformed uploads

## Current Vulnerabilities & Mitigations

### Low Risk

**1. Storage Bandwidth**
- **Risk:** Users download large ZIPs repeatedly
- **Mitigation:** Rate limiting prevents abuse
- **Cost:** ~$0.01 per GB on most hosts
- **Monitoring:** Check hosting bandwidth usage

**2. CPU Usage**
- **Risk:** Image processing is CPU intensive
- **Mitigation:** Rate limiting + file size caps
- **Note:** Render free tier auto-sleeps when idle

**3. DDoS (Distributed Denial of Service)**
- **Risk:** Many IPs attacking simultaneously
- **Mitigation:** Rate limiting per IP, but distributed attacks harder to stop
- **Solution:** Cloudflare (free tier) for DDoS protection

## Recommended Additional Measures (Optional)

### For High-Traffic Production

**1. Add Cloudflare**
```
Free tier includes:
- DDoS protection
- CDN caching
- Bot detection
- Additional rate limiting
```

**2. Add Analytics**
```javascript
// Track usage patterns
import analytics from 'simple-analytics';
analytics.track('image_processed', { count: files.length });
```

**3. Add Captcha (for very high abuse)**
```javascript
// Add Google reCAPTCHA to frontend
// Verify on backend before processing
```

**4. Add API Keys (for private use)**
```javascript
// Require API key in header
if (req.headers['x-api-key'] !== process.env.API_KEY) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### For Enterprise Use

**1. User Accounts**
- Track usage per user
- Implement quotas
- Charge for heavy usage

**2. Queue System**
- Use Redis + Bull for job queue
- Process images asynchronously
- Better resource management

**3. Horizontal Scaling**
- Multiple server instances
- Load balancer
- Shared rate limit state (Redis)

## Monitoring & Alerts

**What to Monitor:**
1. Request volume (spike detection)
2. Error rates (abuse attempts)
3. CPU/Memory usage (resource exhaustion)
4. Bandwidth usage (cost monitoring)

**Tools:**
- Render Dashboard (built-in metrics)
- Sentry (error tracking)
- UptimeRobot (uptime monitoring)
- Google Analytics (usage patterns)

## Testing Security Measures

### Test Rate Limiting

```bash
# Try 21 requests in 15 minutes (should get rate limited)
for i in {1..21}; do
  curl -X POST http://localhost:3000/process \
    -F "image=@test.jpg" \
    -w "\n%{http_code}\n"
  sleep 1
done
```

### Test File Size Limit

```bash
# Try to upload 30MB file (should fail)
dd if=/dev/zero of=large.jpg bs=1M count=30
curl -X POST http://localhost:3000/process \
  -F "image=@large.jpg" \
  -w "\n%{http_code}\n"
```

### Test File Count Limit

```bash
# Try to upload 51 files (should fail)
# Would need to create script to generate 51 form fields
```

## Abuse Response Plan

**If you detect abuse:**

1. **Check Logs**
   ```bash
   # On Render, check deployment logs
   # Look for patterns: IPs, timestamps, error types
   ```

2. **Temporary Fixes**
   ```javascript
   // Add IP to blocklist
   const blockedIPs = ['123.456.789.0'];
   if (blockedIPs.includes(req.ip)) {
     return res.status(403).json({ error: 'Forbidden' });
   }
   ```

3. **Adjust Rate Limits**
   ```javascript
   // Reduce limits temporarily
   max: 10, // Was 20
   windowMs: 30 * 60 * 1000 // 30 minutes instead of 15
   ```

4. **Add Cloudflare**
   - Enable "Under Attack Mode"
   - Add firewall rules
   - Block countries if needed

## Security Checklist

- [x] Rate limiting implemented
- [x] File size limits enforced
- [x] Security headers added
- [x] CORS configured
- [x] Input validation
- [x] Error handling
- [x] In-memory processing
- [ ] Cloudflare DDoS protection (optional)
- [ ] Analytics/monitoring (optional)
- [ ] Captcha (if abuse occurs)

## Reporting Security Issues

If you find a security vulnerability:
1. **DO NOT** create a public GitHub issue
2. Email: [your-email@domain.com]
3. Include detailed description and reproduction steps

---

Last updated: 2025-11-12
Version: 1.0
