
import express from 'express';
// import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// import { requireRole } from '../mw/authz.js';

export const router = express.Router();
// const s3 = new S3Client({ region: process.env.S3_REGION });

// This would require AWS SDK and proper configuration.
// router.get('/signed-url', requireRole('admin','supervisor','viewer'), async (req,res)=>{
router.get('/signed-url', async (req,res)=>{
  const { key } = req.query; // ej: calls/2025-09-12_...wav
  if (!key) return res.status(400).json({error:'missing_key'});
  
  // const url = await getSignedUrl(s3, new GetObjectCommand({
  //   Bucket: process.env.S3_BUCKET_RECORDINGS,
  //   Key: String(key),
  //   ResponseContentType: 'audio/wav'
  // }), { expiresIn: 60 * 10 }); // 10 min
  
  // Placeholder URL
  const url = `https://example.com/recordings/${key}`;

  res.json({ url });
});
