import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

// Helper to load local .env in development when process.env variables are missing
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
    console.warn('Failed to load local .env file:', err);
  }
}

// Load env variables
loadEnv();

/**
 * Builds the shared email header/footer HTML (logo + Hind Siliguri font import)
 */
function buildEmailWrapper(bodyHtml) {
  const origin = process.env.VITE_SUPABASE_URL
    ? 'https://sciencecafesohelsir.vercel.app'
    : 'http://localhost:5173';

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
    .outer {
      max-width: 560px;
      margin: 0 auto;
    }
    .logo-wrap {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo-wrap img {
      max-height: 80px;
      width: auto;
    }
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
      &copy; 2026 Science Cafe with Sohel Sir. সর্বস্বত্ব সংরক্ষিত।<br>
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

  const { email, studentName } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gmailEmail = process.env.GMAIL_EMAIL;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase URL or Service Role Key is not configured on the server.' });
  }

  if (!gmailEmail || !gmailAppPassword) {
    return res.status(500).json({ error: 'Gmail email or App Password is not configured on the server.' });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Determine redirect URL
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const redirectTo = origin;

    console.log(`Generating recovery link for: ${email} (Redirect to: ${redirectTo})`);

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: { redirectTo }
    });

    if (error) {
      console.error('Supabase generateLink error:', error);
      return res.status(400).json({ error: error.message });
    }

    const resetLink = data.properties.action_link;
    const greeting = studentName ? `আস্সালামু আলাইকুম <strong>${studentName}</strong>,` : 'আস্সালামু আলাইকুম,';

    const bodyHtml = `
      <style>
        h2 { font-family: 'Hind Siliguri', sans-serif; color: #ff5900; font-size: 20px; margin-bottom: 20px; text-align: center; font-weight: 700; }
        p { font-family: 'Hind Siliguri', sans-serif; font-size: 15px; line-height: 1.85; color: #d1c7bd; margin-bottom: 16px; }
        .btn-wrap { text-align: center; margin: 28px 0; }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #ff5900 0%, #ff7a30 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 36px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 16px;
          font-family: 'Hind Siliguri', sans-serif;
          box-shadow: 0 4px 16px rgba(255,89,0,0.35);
          letter-spacing: 0.3px;
        }
        .link-fallback { font-size: 12px; color: #8c8075; word-break: break-all; text-align: center; }
        .link-fallback a { color: #ff5900; text-decoration: none; }
        .divider { border: none; border-top: 1px solid #3a2a1a; margin: 20px 0; }
        .disclaimer { font-size: 12px; color: #6b5c4d; font-family: 'Hind Siliguri', sans-serif; text-align: center; }
      </style>

      <h2>🔐 পাসওয়ার্ড রিসেট</h2>
      <p>${greeting}</p>
      <p>আমরা তোমার অ্যাকাউন্টের পাসওয়ার্ড রিসেটের একটি অনুরোধ পেয়েছি। নিচের বোতামে ক্লিক করে নতুন পাসওয়ার্ড সেট করো।</p>

      <div class="btn-wrap">
        <a href="${resetLink}" class="btn" target="_blank">নতুন পাসওয়ার্ড সেট করো</a>
      </div>

      <p class="link-fallback">
        বোতামটি কাজ না করলে, এই লিংকটি কপি করে ব্রাউজারে পেস্ট করো:<br>
        <a href="${resetLink}">${resetLink}</a>
      </p>

      <hr class="divider">
      <p class="disclaimer">তুমি যদি পাসওয়ার্ড রিসেটের অনুরোধ না করে থাকো, তাহলে এই ইমেইলটি উপেক্ষা করো।</p>
    `;

    console.log('Sending password reset email to:', email);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailEmail,
        pass: gmailAppPassword,
      },
    });

    const mailOptions = {
      from: `"Science Cafe" <${gmailEmail}>`,
      to: email,
      subject: '🔐 Science Cafe — পাসওয়ার্ড রিসেট',
      html: buildEmailWrapper(bodyHtml),
    };

    await transporter.sendMail(mailOptions);

    console.log('Password reset email sent successfully via Gmail SMTP.');
    return res.status(200).json({ message: 'Password reset link sent successfully.' });
  } catch (err) {
    console.error('Internal error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
