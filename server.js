const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const app = express();

const API_KEY = 'sk-0b39e414c69a6b88ab17133f38c4bf40';
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Upload file to PixVerse
async function uploadFile(fileBuffer, fileName) {
  const form = new FormData();
  form.append('file', fileBuffer, fileName);

  try {
    const res = await axios.post(
      'https://app-api.pixverse.ai/openapi/v2/media/upload',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'API-KEY': API_KEY,
          'Ai-Trace-Id': `${Date.now()}-${fileName}`
        }
      }
    );
    return res.data?.data?.media_id || res.data?.media_id;
  } catch (error) {
    throw new Error(`Upload failed: ${error.response?.data?.msg || error.message}`);
  }
}

// Generate lip sync
async function generateLipSync(video_media_id, audio_media_id) {
  try {
    const res = await axios.post(
      'https://app-api.pixverse.ai/openapi/v2/video/lip_sync/generate',
      {
        video_media_id,
        audio_media_id
      },
      {
        headers: {
          'API-KEY': API_KEY,
          'Ai-Trace-Id': `${Date.now()}-lipsync`
        }
      }
    );
    return res.data?.data?.video_id || res.data?.video_id;
  } catch (error) {
    throw new Error(`Generate failed: ${error.response?.data?.msg || error.message}`);
  }
}

// Poll for result
async function pollResult(video_id, maxAttempts = 120) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await axios.get(
        `https://app-api.pixverse.ai/openapi/v2/video/result/${video_id}`,
        {
          headers: { 'API-KEY': API_KEY }
        }
      );

      const status = res.data?.data?.status || res.data?.status;
      const mp4_url = res.data?.data?.url || res.data?.url;
      const msg = res.data?.data?.msg || res.data?.msg;

      console.log(`Attempt ${i + 1}: status=${status}, has_url=${!!mp4_url}`);

      if (status === 1 && mp4_url) {
        return { mp4_url, msg, status };
      }

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      throw new Error(`Poll failed: ${error.message}`);
    }
  }

  throw new Error('Timeout: Processing took too long');
}

// Main endpoint
app.post('/generate', async (req, res) => {
  try {
    const { video, audio } = req.body;

    if (!video || !audio) {
      return res.status(400).json({ error: 'Missing video or audio' });
    }

    // Convert base64 to buffer
    const videoBuffer = Buffer.from(video, 'base64');
    const audioBuffer = Buffer.from(audio, 'base64');

    console.log('📤 Uploading video...');
    const video_media_id = await uploadFile(videoBuffer, 'video.mp4');

    console.log('📤 Uploading audio...');
    const audio_media_id = await uploadFile(audioBuffer, 'audio.mp3');

    console.log('🎬 Generating lip sync...');
    const video_id = await generateLipSync(video_media_id, audio_media_id);

    console.log('⏳ Polling for result...');
    const result = await pollResult(video_id);

    res.json({
      ok: true,
      video_id,
      mp4_url: result.mp4_url,
      msg: result.msg,
      status: result.status
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
