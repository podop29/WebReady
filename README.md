# WebReady - Image Optimization Tool

Replace multiple image optimization tools with one. Convert to WebP/AVIF, resize for all devices, and generate HTML code in a single click.

## Features

- Convert images to WebP and AVIF formats
- Generate responsive images at multiple breakpoints
- Batch process multiple images
- Download production-ready HTML snippets
- No account required, completely free

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Image Processing:** Sharp

## Local Development

```bash
npm install
npm run dev
```

Server runs on `http://localhost:3000`

## Deployment

### Backend (Render)
1. Push to GitHub
2. Connect repository to Render
3. Render will auto-detect `render.yaml`
4. Deploy

### Frontend (Netlify)
1. Connect repository to Netlify
2. Update `netlify.toml` with your Render API URL
3. Publish directory: `public`
4. Deploy

## Environment Variables

No environment variables required for basic setup.

## License

MIT

---

Made by [Lake View Web Development](https://lakeview-webdev.com)
