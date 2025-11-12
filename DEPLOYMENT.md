# WebReady Deployment Guide

## Architecture

- **Frontend (Netlify):** Static HTML/CSS/JS served from `public/` directory
- **Backend (Render):** Node.js API server with image processing

## Step-by-Step Deployment

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Deploy Backend to Render

1. Go to [render.com](https://render.com) and sign up
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Render will auto-detect the `render.yaml` configuration
5. Click **"Create Web Service"**
6. Wait for deployment (3-5 minutes)
7. Copy your API URL (e.g., `https://webready-api.onrender.com`)

**Important:** Render free tier spins down after inactivity. First request may take 30-60 seconds.

### 3. Update Frontend for Production

Open `public/index.html` and update the API endpoints:

**Find these lines** (around line 960-970):
```javascript
const response = await fetch('/process-batch', {
```

**Replace with:**
```javascript
const response = await fetch('https://YOUR-RENDER-URL.onrender.com/process-batch', {
```

Do this for both `/process` and `/process-batch` endpoints.

**Or** use Netlify redirects (recommended - see below).

### 4. Deploy Frontend to Netlify

#### Option A: Netlify Redirects (Recommended)

1. Update `netlify.toml`:
```toml
[[redirects]]
  from = "/process"
  to = "https://YOUR-RENDER-URL.onrender.com/process"
  status = 200
  force = true

[[redirects]]
  from = "/process-batch"
  to = "https://YOUR-RENDER-URL.onrender.com/process-batch"
  status = 200
  force = true
```

2. Deploy to Netlify:
   - Go to [netlify.com](https://netlify.com)
   - Click **"Add new site"** → **"Import an existing project"**
   - Connect GitHub repository
   - Build settings:
     - **Build command:** Leave empty
     - **Publish directory:** `public`
   - Click **"Deploy site"**

#### Option B: Direct API Calls

Update the frontend code to call Render directly (less clean but works).

### 5. Update CORS in Backend

After deploying to Netlify, update `server.js` line 20:

```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'https://your-site.netlify.app',  // Add your Netlify URL
];
```

Commit and push - Render will auto-deploy.

### 6. Test Production

1. Visit your Netlify URL
2. Upload test images
3. Process and download
4. Check browser console for errors

## Alternative Backend Hosts

### Railway.app
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Fly.io
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly deploy
```

## Cost Estimates

| Service | Free Tier | Paid Plans |
|---------|-----------|------------|
| Netlify | 100GB bandwidth/month | $19/mo for Pro |
| Render | 750 hours/month | $7/mo per service |
| Railway | $5 credit/month | Pay as you go |
| Fly.io | 3 shared VMs | $1.94/mo per VM |

## Monitoring

- **Render Dashboard:** Check deployment logs and metrics
- **Netlify Analytics:** Monitor traffic and performance
- **Uptime Monitoring:** Use [UptimeRobot](https://uptimerobot.com) (free)

## Troubleshooting

### "Failed to fetch" errors
- Check CORS settings in `server.js`
- Verify Render API URL is correct
- Check Render logs for errors

### "Method Not Allowed" errors
- Ensure API endpoints are correct
- Check Netlify redirects are working

### Slow processing
- Render free tier has cold starts (30-60s)
- Consider upgrading to paid tier for production

### Images not downloading
- Check browser console for CORS errors
- Verify backend is returning ZIP correctly

## Production Checklist

- [ ] Backend deployed to Render
- [ ] Frontend deployed to Netlify
- [ ] CORS updated with Netlify domain
- [ ] API URLs updated in frontend (or redirects configured)
- [ ] Test upload and process
- [ ] Custom domain configured (optional)
- [ ] Analytics setup (optional)

## Support

Issues? Email support or create a GitHub issue.

---

Made by [Lake View Web Development](https://lakeview-webdev.com)
