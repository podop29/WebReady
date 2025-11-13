// server.js
import express from 'express';
import archiver from 'archiver';
import sharp from 'sharp';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for our frontend
  crossOriginEmbedderPolicy: false
}));

// CORS configuration for production
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'https://webreadydev.netlify.app',
    'https://webready.dev',
    'https://webready.onrender.com'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes per IP
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for batch processing (more resource intensive)
const batchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 batch requests per hour per IP
  message: { error: 'Batch processing limit reached. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Multer in-memory uploads (25 MB cap per file, 100 MB total request)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB per file
    files: 50, // Max 50 files
    fieldSize: 10 * 1024 * 1024 // 10MB for form fields
  }
});

/**
 * POST /process
 * multipart/form-data:
 *   image: (file)   <-- REQUIRED, field name must be "image"
 *   widths: "480,768,1200" (optional)
 *   formats: "webp,avif"   (optional; default webp)
 *   quality_webp: 1–100     (optional; default 82)
 *   quality_avif: 1–100     (optional; default 55)
 *   basename: string        (optional)
 *   sizes: string           (optional)
 */
app.post('/process', apiLimiter, upload.single('image'), async (req, res) => {
  try {
    // --- quick visibility ---
    console.log('CT:', req.headers['content-type']);
    console.log('file present?', !!req.file, 'body keys:', Object.keys(req.body || {}));

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Missing file: form field "image" is required.' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const defaultBreakpoints = [480, 768, 1200];

    const widths = String(body.widths ?? defaultBreakpoints.join(','))
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    const formats = String(body.formats ?? 'webp')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(f => f === 'webp' || f === 'avif');
    if (formats.length === 0) formats.push('webp');

    const qWebp = Math.min(100, Math.max(1, parseInt(String(body.quality_webp ?? '82'), 10)));
    const qAvif = Math.min(100, Math.max(1, parseInt(String(body.quality_avif ?? '55'), 10)));

    const baseName = String(body.basename ?? file.originalname ?? 'image').replace(/\.[^.]+$/, '');
    const sizesIn =
      String(body.sizes ??
        `(max-width: ${widths[0]}px) 100vw, (max-width: ${widths[1] || widths[0]}px) 50vw, ${widths[widths.length - 1]}px`
      );

    // Probe metadata from the uploaded buffer
    let meta;
    try {
      meta = await sharp(file.buffer).metadata();
    } catch (e) {
      console.error('metadata error:', e);
      return res.status(400).json({ error: 'Could not read image metadata (unsupported/corrupt file?).' });
    }
    const origW = meta.width;
    if (!origW) return res.status(400).json({ error: 'Could not determine image width from metadata.' });

    const finalWidths = widths.filter(w => w <= origW);
    if (finalWidths.length === 0) {
      return res.status(400).json({
        error: `All requested widths exceed original width (${origW}px).`,
        hint: `Use widths <= ${origW}.`
      });
    }

    // Precompute outputs first
    const outputs = []; // { name, fmt, width, buf }
    try {
      for (const w of finalWidths) {
        const pipeline = sharp(file.buffer).resize({ width: w, withoutEnlargement: true });
        if (formats.includes('webp')) {
          outputs.push({
            name: `${baseName}-${w}.webp`,
            fmt: 'webp',
            width: w,
            buf: await pipeline.clone().webp({ quality: qWebp }).toBuffer()
          });
        }
        if (formats.includes('avif')) {
          outputs.push({
            name: `${baseName}-${w}.avif`,
            fmt: 'avif',
            width: w,
            buf: await pipeline.clone().avif({ quality: qAvif }).toBuffer()
          });
        }
      }
    } catch (e) {
      console.error('sharp processing error:', e);
      return res.status(500).json({ error: 'Image processing failed in sharp.', detail: String(e) });
    }

    const srcsets = { webp: [], avif: [] };
    for (const out of outputs) srcsets[out.fmt].push(`${out.name} ${out.width}w`);

    const baseSrc = (formats.includes('webp')
      ? `${baseName}-${finalWidths[0]}.webp`
      : `${baseName}-${finalWidths[0]}.avif`);

    const imgSnippet =
`<img
  src="${baseSrc}"
  srcset="${(formats.includes('webp') ? srcsets.webp : srcsets.avif).join(', ')}"
  sizes="${sizesIn}"
  alt=""
  loading="lazy"
  decoding="async"
/>`;

    const pictureSnippet = (formats.length > 1)
      ? `<picture>
  ${srcsets.avif.length ? `<source type="image/avif" srcset="${srcsets.avif.join(', ')}" sizes="${sizesIn}">` : ''}
  ${srcsets.webp.length ? `<source type="image/webp" srcset="${srcsets.webp.join(', ')}" sizes="${sizesIn}">` : ''}
  <img src="${baseSrc}" alt="" loading="lazy" decoding="async">
</picture>`
      : imgSnippet;

    const snippetDoc =
`<!-- WebReady output -->
<!-- widths: ${finalWidths.join(', ')} | formats: ${formats.join(', ')} -->
<!-- sizes: ${sizesIn} -->

<!-- Option A: <img> -->
${imgSnippet}

<!-- Option B: <picture> -->
${pictureSnippet}
`;

    // Zip and stream
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}-assets.zip"`);

    const zip = archiver('zip', { zlib: { level: 9 } });
    zip.on('error', err => console.error('zip error:', err));
    zip.pipe(res);

    for (const out of outputs) zip.append(out.buf, { name: out.name });
    zip.append(snippetDoc, { name: 'snippet.html' });
    await zip.finalize();
  } catch (err) {
    console.error('unexpected error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Unexpected server error.', detail: String(err) });
  }
});

/**
 * POST /process-batch
 * multipart/form-data:
 *   images: (files)  <-- REQUIRED, field name must be "images" (multiple files)
 *   widths: "480,768,1200" (optional)
 *   formats: "webp,avif"   (optional; default webp)
 *   quality_webp: 1–100     (optional; default 82)
 *   quality_avif: 1–100     (optional; default 55)
 */
app.post('/process-batch', batchLimiter, upload.array('images', 50), async (req, res) => {
  try {
    console.log('Batch processing:', req.files?.length || 0, 'files');

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided. Use field name "images".' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const defaultBreakpoints = [480, 768, 1200];

    const widths = String(body.widths ?? defaultBreakpoints.join(','))
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    const formats = String(body.formats ?? 'webp')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(f => f === 'webp' || f === 'avif');
    if (formats.length === 0) formats.push('webp');

    const qWebp = Math.min(100, Math.max(1, parseInt(String(body.quality_webp ?? '82'), 10)));
    const qAvif = Math.min(100, Math.max(1, parseInt(String(body.quality_avif ?? '55'), 10)));

    // Process all images
    const allOutputs = [];
    const allSnippets = [];

    for (const file of files) {
      const baseName = String(file.originalname ?? 'image').replace(/\.[^.]+$/, '');

      // Probe metadata
      let meta;
      try {
        meta = await sharp(file.buffer).metadata();
      } catch (e) {
        console.error(`Metadata error for ${file.originalname}:`, e);
        continue; // Skip this file
      }

      const origW = meta.width;
      if (!origW) {
        console.error(`Could not determine width for ${file.originalname}`);
        continue;
      }

      const finalWidths = widths.filter(w => w <= origW);
      if (finalWidths.length === 0) {
        console.error(`All widths exceed original width for ${file.originalname} (${origW}px)`);
        continue;
      }

      // Process this image
      const outputs = [];
      try {
        for (const w of finalWidths) {
          const pipeline = sharp(file.buffer).resize({ width: w, withoutEnlargement: true });
          if (formats.includes('webp')) {
            outputs.push({
              name: `${baseName}-${w}.webp`,
              fmt: 'webp',
              width: w,
              buf: await pipeline.clone().webp({ quality: qWebp }).toBuffer()
            });
          }
          if (formats.includes('avif')) {
            outputs.push({
              name: `${baseName}-${w}.avif`,
              fmt: 'avif',
              width: w,
              buf: await pipeline.clone().avif({ quality: qAvif }).toBuffer()
            });
          }
        }
      } catch (e) {
        console.error(`Processing error for ${file.originalname}:`, e);
        continue;
      }

      // Generate snippet for this image
      const sizesIn = `(max-width: ${finalWidths[0]}px) 100vw, (max-width: ${finalWidths[1] || finalWidths[0]}px) 50vw, ${finalWidths[finalWidths.length - 1]}px`;
      const srcsets = { webp: [], avif: [] };
      for (const out of outputs) srcsets[out.fmt].push(`${out.name} ${out.width}w`);

      const baseSrc = (formats.includes('webp')
        ? `${baseName}-${finalWidths[0]}.webp`
        : `${baseName}-${finalWidths[0]}.avif`);

      const imgSnippet =
`<img
  src="${baseSrc}"
  srcset="${(formats.includes('webp') ? srcsets.webp : srcsets.avif).join(', ')}"
  sizes="${sizesIn}"
  alt=""
  loading="lazy"
  decoding="async"
/>`;

      const pictureSnippet = (formats.length > 1)
        ? `<picture>
  ${srcsets.avif.length ? `<source type="image/avif" srcset="${srcsets.avif.join(', ')}" sizes="${sizesIn}">` : ''}
  ${srcsets.webp.length ? `<source type="image/webp" srcset="${srcsets.webp.join(', ')}" sizes="${sizesIn}">` : ''}
  <img src="${baseSrc}" alt="" loading="lazy" decoding="async">
</picture>`
        : imgSnippet;

      const snippetDoc =
`<!-- ${baseName} -->
<!-- widths: ${finalWidths.join(', ')} | formats: ${formats.join(', ')} -->

${imgSnippet}

<!-- Or use <picture> for multiple formats: -->
${pictureSnippet}

`;

      allOutputs.push(...outputs);
      allSnippets.push(snippetDoc);
    }

    if (allOutputs.length === 0) {
      return res.status(400).json({ error: 'No images could be processed.' });
    }

    // Create single ZIP with all images
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="webready-batch.zip"');

    const zip = archiver('zip', { zlib: { level: 9 } });
    zip.on('error', err => console.error('zip error:', err));
    zip.pipe(res);

    // Add all processed images
    for (const out of allOutputs) {
      zip.append(out.buf, { name: out.name });
    }

    // Add combined snippets file
    const combinedSnippets =
`<!-- WebReady Batch Output -->
<!-- ${files.length} images processed -->
<!-- widths: ${widths.join(', ')} | formats: ${formats.join(', ')} -->

${allSnippets.join('\n---\n\n')}
`;
    zip.append(combinedSnippets, { name: 'snippets.html' });

    await zip.finalize();
  } catch (err) {
    console.error('batch processing error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Batch processing failed.', detail: String(err) });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 25MB per file.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: 'Too many files. Maximum is 50 files per batch.' });
    }
    if (err.code === 'LIMIT_FIELD_VALUE') {
      return res.status(413).json({ error: 'Request data too large.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`WebReady server running on http://localhost:${port}`));
