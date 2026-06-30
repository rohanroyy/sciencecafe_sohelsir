import fs from 'fs';
import path from 'path';

// Helper to load local .env in development
function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
            value = value.substring(1, value.length - 1);
          } else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
            value = value.substring(1, value.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = value.trim();
          }
        }
      });
    }
  } catch (err) {
    console.warn('Failed to load .env file:', err);
  }
}

loadEnv();

/**
 * Builds the full HTML email for batch welcome
 * @param {object} params
 * @param {string} params.studentName
 * @param {string} params.teacherName
 * @param {string} params.batchTitle
 * @param {string[]} params.subjects
 */
function buildWelcomeEmail({ studentName, teacherName, batchTitle, subjects }) {
  const subjectList = subjects && subjects.length > 0
    ? subjects.map(s => `<li style="margin-bottom:6px;">📚 ${s}</li>`).join('\n')
    : '<li>বিস্তারিত জানানো হবে</li>';

  const bodyHtml = `
    <style>
      h2 { font-family: 'Hind Siliguri', sans-serif; color: #ff5900; font-size: 22px; margin-bottom: 8px; text-align: center; font-weight: 700; }
      .subtitle { font-family: 'Hind Siliguri', sans-serif; font-size: 13px; color: #9c8570; text-align: center; margin-bottom: 28px; }
      p { font-family: 'Hind Siliguri', sans-serif; font-size: 15px; line-height: 1.9; color: #d1c7bd; margin-bottom: 16px; }
      strong { color: #ffcfac; }
      .subject-box {
        background: rgba(255,89,0,0.07);
        border: 1px solid rgba(255,89,0,0.2);
        border-radius: 10px;
        padding: 16px 20px;
        margin: 20px 0;
      }
      .subject-box h4 { font-family: 'Hind Siliguri', sans-serif; color: #ff5900; font-size: 14px; font-weight: 700; margin-bottom: 10px; }
      .subject-box ul { list-style: none; padding: 0; margin: 0; }
      .subject-box ul li { font-family: 'Hind Siliguri', sans-serif; color: #d1c7bd; font-size: 14px; padding: 2px 0; }
      .features-box {
        background: rgba(255,255,255,0.03);
        border: 1px solid #3a2a1a;
        border-radius: 10px;
        padding: 16px 20px;
        margin: 20px 0;
      }
      .features-box p { margin-bottom: 8px; font-size: 14px; }
      .divider { border: none; border-top: 1px solid #3a2a1a; margin: 24px 0; }
      .closing { font-family: 'Hind Siliguri', sans-serif; font-size: 14px; color: #ff8a4a; text-align: center; font-weight: 600; margin-top: 8px; }
    </style>

    <h2>🎉 Science Cafe with Sohel Sir এ তোমাকে স্বাগতম!</h2>
    <p class="subtitle">ভর্তি সফলভাবে সম্পন্ন হয়েছে</p>

    <p>আস্সালামু আলাইকুম <strong>${studentName}</strong>,</p>

    <p>আলহামদুলিল্লাহ!</p>

    <p>তোমার ভর্তি সফলভাবে সম্পন্ন হয়েছে। <strong>${teacherName}</strong> স্যার তোমার আবেদন অনুমোদন করেছেন এবং এখন তুমি <strong>${batchTitle}</strong> ব্যাচের একজন শিক্ষার্থী।</p>

    <div class="subject-box">
      <h4>এই ব্যাচে যা যা পড়ানো হবে:</h4>
      <ul>
        ${subjectList}
      </ul>
    </div>

    <p>এখন থেকে তুমি এই ব্যাচের সকল আপডেট Science Cafe with Sohel Sir অ্যাপের মধ্যেই পাবে।</p>

    <div class="features-box">
      <p><strong>অ্যাপে তুমি যা যা পাচ্ছো:</strong></p>
      <p>📝 ক্লাস শিট, নোট ও অন্যান্য স্টাডি ম্যাটেরিয়াল</p>
      <p>📢 গুরুত্বপূর্ণ নোটিশ ও আপডেট</p>
      <p>📅 অনলাইনে এমসিকিউ এক্সামের মাধ্যমে নিজের র‍্যাংক যাচাই</p>
    </div>

    <p>তাই অনুরোধ থাকবে, নিয়মিত অ্যাপে লগইন করে আপডেটগুলো অনুসরণ করবে যাতে কোনো ক্লাস বা গুরুত্বপূর্ণ তথ্য মিস না হয়।</p>

    <hr class="divider">

    <p>আমরা আশা করি, <strong>${teacherName}</strong> স্যারের সঠিক দিকনির্দেশনা এবং তোমার আন্তরিক প্রচেষ্টায় এই যাত্রা হবে সফল ও ফলপ্রসূ।</p>

    <p>তোমার জন্য অনেক অনেক শুভকামনা। নতুন শিক্ষাযাত্রা হোক সুন্দর, সহজ এবং সফল। 🌸</p>

    <p class="closing">— Science Cafe with Sohel Sir</p>
  `;

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Hind Siliguri', sans-serif;
      background-color: #0f0a06;
      color: #e8e0d8;
      margin: 0;
      padding: 32px 16px;
    }
    .outer { max-width: 560px; margin: 0 auto; }
    .logo-wrap { text-align: center; margin-bottom: 24px; }
    .logo-wrap img { max-height: 80px; width: auto; }
    .card {
      background: linear-gradient(145deg, #1c1208 0%, #241709 100%);
      border: 1px solid #3a2a1a;
      border-radius: 16px;
      padding: 36px 32px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    }
    .footer {
      text-align: center;
      margin-top: 28px;
      font-size: 12px;
      color: #6b5c4d;
      font-family: 'Hind Siliguri', sans-serif;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="outer">
    <div class="logo-wrap">
      <img src="https://sciencecafesohelsir.vercel.app/black%20logo.svg" alt="Science Cafe with Sohel Sir" />
    </div>
    <div class="card">
      ${bodyHtml}
    </div>
    <div class="footer">
      &copy; 2026 Science Cafe with Sohel Sir. All rights reserved.।<br>
      এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে, উত্তর দেওয়ার প্রয়োজন নেই।
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { studentEmail, studentName, teacherName, batchTitle, subjects } = req.body;

  if (!studentEmail || !studentName || !teacherName || !batchTitle) {
    return res.status(400).json({ error: 'studentEmail, studentName, teacherName, and batchTitle are required.' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    return res.status(500).json({ error: 'Resend API Key is not configured on the server.' });
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Science Cafe <onboarding@resend.dev>';
    const html = buildWelcomeEmail({ studentName, teacherName, batchTitle, subjects: subjects || [] });

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: studentEmail,
        subject: '🎉 Science Cafe with Sohel Sir এ তোমাকে স্বাগতম!',
        html
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend error:', resendData);
      return res.status(resendResponse.status).json({ error: resendData.message || 'Failed to send welcome email.' });
    }

    console.log('Batch welcome email sent to:', studentEmail);
    return res.status(200).json({ message: 'Welcome email sent successfully.' });
  } catch (err) {
    console.error('Internal error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
