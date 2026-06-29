import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase URL or Service Role Key is not configured on the server.' });
  }

  if (!resendApiKey) {
    return res.status(500).json({ error: 'Resend API Key is not configured on the server.' });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Determine redirect URL
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const redirectTo = origin;

    console.log(`Generating recovery link for: ${email} (Redirect to: ${redirectTo})`);

    // Generate the recovery link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectTo
      }
    });

    if (error) {
      console.error('Supabase generateLink error:', error);
      return res.status(400).json({ error: error.message });
    }

    const resetLink = data.properties.action_link;

    // Send email via Resend API
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Science Cafe <onboarding@resend.dev>';
    const emailBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #120c08;
            color: #f3f3f3;
            margin: 0;
            padding: 40px 20px;
          }
          .card {
            max-width: 500px;
            margin: 0 auto;
            background-color: #1a1410;
            border: 1px solid #2d241e;
            border-radius: 12px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #ff5900;
            margin-bottom: 24px;
            letter-spacing: 0.5px;
          }
          h2 {
            font-size: 22px;
            margin-bottom: 12px;
            color: #ffffff;
          }
          p {
            font-size: 15px;
            line-height: 1.6;
            color: #d1c7bd;
            margin-bottom: 24px;
          }
          .btn {
            display: inline-block;
            background-color: #ff5900;
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 28px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 15px;
            margin-bottom: 24px;
            box-shadow: 0 4px 12px rgba(255, 89, 0, 0.25);
            transition: background-color 0.15s;
          }
          .btn:hover {
            background-color: #e04e00;
          }
          .footer {
            font-size: 12px;
            color: #8c8075;
            border-top: 1px solid #2d241e;
            padding-top: 20px;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">Science Cafe</div>
          <h2>Password Reset Request</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password for your Science Cafe student account. Click the button below to choose a new password.</p>
          <a href="${resetLink}" class="btn" target="_blank">Reset Password</a>
          <p style="font-size: 13px; color: #8c8075; word-break: break-all;">
            If the button doesn't work, copy and paste this link in your browser:<br>
            <a href="${resetLink}" style="color: #ff5900; text-decoration: none;">${resetLink}</a>
          </p>
          <div class="footer">
            If you did not request a password reset, you can safely ignore this email.<br>
            &copy; 2026 Science Cafe with Sohel Sir. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;

    console.log('Sending email to:', email);
    
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: 'Reset your password - Science Cafe',
        html: emailBody
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend email delivery error:', resendData);
      return res.status(resendResponse.status).json({ error: resendData.message || 'Failed to send email via Resend.' });
    }

    console.log('Resend email sent successfully:', resendData);
    return res.status(200).json({ message: 'Password reset link sent successfully.' });
  } catch (err) {
    console.error('Internal server error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
