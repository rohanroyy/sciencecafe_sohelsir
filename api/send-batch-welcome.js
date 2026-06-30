import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

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

function buildWelcomeEmail({ studentName, teacherName, batchTitle, subjects }) {
  const subjectList = subjects && subjects.length > 0
    ? subjects.map(s => `<li style="margin-bottom: 6px; font-size: 14px; color: #2e251e; font-family: 'Hind Siliguri', sans-serif;">📚 ${s}</li>`).join('\n')
    : `<li style="margin-bottom: 6px; font-size: 14px; color: #2e251e; font-family: 'Hind Siliguri', sans-serif;">বিস্তারিত জানানো হবে</li>`;

  const bodyHtml = `
    <h2 style="color: #ff5900; font-size: 22px; margin-bottom: 4px; font-weight: 700; text-align: center; font-family: 'Hind Siliguri', sans-serif;">🎉 Science Cafe with Sohel Sir এ তোমাকে স্বাগতম!</h2>
    <p style="font-size: 13px; color: #8c8075; text-align: center; margin-top: 0; margin-bottom: 24px; font-family: 'Hind Siliguri', sans-serif;">ভর্তি সফলভাবে সম্পন্ন হয়েছে</p>

    <p style="margin-bottom: 16px; font-size: 15px; color: #2e251e; line-height: 1.85; font-family: 'Hind Siliguri', sans-serif;">আস্সালামু আলাইকুম <strong>${studentName}</strong>,</p>

    <p style="margin-bottom: 16px; font-size: 15px; color: #2e251e; line-height: 1.85; font-family: 'Hind Siliguri', sans-serif;">আলহামদুলিল্লাহ!</p>

    <p style="margin-bottom: 16px; font-size: 15px; color: #2e251e; line-height: 1.85; font-family: 'Hind Siliguri', sans-serif;">তোমার ভর্তি সফলভাবে সম্পন্ন হয়েছে। <strong>${teacherName}</strong> স্যার তোমার আবেদন অনুমোদন করেছেন এবং এখন তুমি <strong>${batchTitle}</strong> ব্যাচের একজন শিক্ষার্থী।</p>

    <div style="background-color: #fff9f5; border: 1px solid #ffe3d1; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <h4 style="color: #ff5900; font-size: 14px; font-weight: 700; margin-top: 0; margin-bottom: 10px; font-family: 'Hind Siliguri', sans-serif;">এই ব্যাচে যা যা পড়ানো হবে:</h4>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${subjectList}
      </ul>
    </div>

    <p style="margin-bottom: 16px; font-size: 15px; color: #2e251e; line-height: 1.85; font-family: 'Hind Siliguri', sans-serif;">এখন থেকে তুমি এই ব্যাচের সকল আপডেট Science Cafe with Sohel Sir অ্যাপের মধ্যেই পাবে।</p>

    <div style="background-color: #fcfbfa; border: 1px solid #e8e2dc; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <p style="margin-bottom: 10px; font-size: 14px; font-weight: 700; color: #2e251e; font-family: 'Hind Siliguri', sans-serif;"><strong>অ্যাপে তুমি যা যা পাচ্ছো:</strong></p>
      <p style="margin-bottom: 6px; font-size: 14px; color: #2e251e; margin-top: 0; font-family: 'Hind Siliguri', sans-serif;">📝 ক্লাস শিট, নোট ও অন্যান্য স্টাডি ম্যাটেরিয়াল</p>
      <p style="margin-bottom: 6px; font-size: 14px; color: #2e251e; margin-top: 0; font-family: 'Hind Siliguri', sans-serif;">📢 গুরুত্বপূর্ণ নোটিশ ও আপডেট</p>
      <p style="margin-bottom: 0; font-size: 14px; color: #2e251e; margin-top: 0; font-family: 'Hind Siliguri', sans-serif;">📅 অনলাইনে এমসিকিউ এক্সামের মাধ্যমে নিজের র‍্যাংক যাচাই</p>
    </div>

    <p style="margin-bottom: 16px; font-size: 15px; color: #2e251e; line-height: 1.85; font-family: 'Hind Siliguri', sans-serif;">তাই অনুরোধ থাকবে, নিয়মিত অ্যাপে লগইন করে আপডেটগুলো অনুসরণ করবে যাতে কোনো ক্লাস বা গুরুত্বপূর্ণ তথ্য মিস না হয়।</p>

    <hr style="border: none; border-top: 1px solid #e8e2dc; margin: 24px 0;" />

    <p style="margin-bottom: 16px; font-size: 15px; color: #2e251e; line-height: 1.85; font-family: 'Hind Siliguri', sans-serif;">আমরা আশা করি, <strong>${teacherName}</strong> স্যারের সঠিক দিকনির্দেশনা এবং তোমার আন্তরিক প্রচেষ্টায় এই যাত্রা হবে সফল ও ফলপ্রসূ।</p>

    <p style="margin-bottom: 16px; font-size: 15px; color: #2e251e; line-height: 1.85; font-family: 'Hind Siliguri', sans-serif;">তোমার জন্য অনেক অনেক শুভকামনা। নতুন শিক্ষাযাত্রা হোক সুন্দর, সহজ এবং সফল। 🌸</p>

    <p style="text-align: center; font-size: 14px; color: #ff5900; font-weight: 700; margin-top: 24px; font-family: 'Hind Siliguri', sans-serif;">— Science Cafe with Sohel Sir</p>
  `;

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 40px 16px; background-color: #f8f6f2; font-family: 'Hind Siliguri', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2e251e; line-height: 1.6;">
  <div style="max-width: 560px; margin: 0 auto;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://sciencecafesohelsir.vercel.app/black%20logo.svg" alt="Science Cafe with Sohel Sir" style="max-height: 70px; width: auto;" />
    </div>
    <div style="background-color: #ffffff; border: 1px solid #e8e2dc; border-radius: 12px; padding: 36px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
      ${bodyHtml}
    </div>
    <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #8c8075; line-height: 1.6;">
      &copy; 2026 Science Cafe with Sohel Sir. All rights reserved.<br>
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

  const gmailEmail = process.env.GMAIL_EMAIL;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailEmail || !gmailAppPassword) {
    return res.status(500).json({ error: 'Gmail email or App Password is not configured on the server.' });
  }

  try {
    const html = buildWelcomeEmail({ studentName, teacherName, batchTitle, subjects: subjects || [] });

    console.log('Sending batch welcome email to:', studentEmail);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailEmail,
        pass: gmailAppPassword,
      },
    });

    const mailOptions = {
      from: `"Science Cafe" <${gmailEmail}>`,
      to: studentEmail,
      subject: '🎉 Science Cafe with Sohel Sir এ তোমাকে স্বাগতম!',
      html,
    };

    await transporter.sendMail(mailOptions);

    console.log('Batch welcome email sent successfully via Gmail SMTP.');
    return res.status(200).json({ message: 'Welcome email sent successfully.' });
  } catch (err) {
    console.error('Internal error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
