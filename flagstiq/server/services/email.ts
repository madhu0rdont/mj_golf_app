import { Resend } from 'resend';
import { logger } from '../logger.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || 'FlagstIQ <noreply@flagstiq.com>';

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    logger.info(`[EMAIL-DEV] To: ${to} | Subject: ${subject}`);
    logger.info(`[EMAIL-DEV] ${html.replace(/<[^>]+>/g, '')}`);
    return;
  }

  try {
    await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error('Failed to send email', { error: String(err), to, subject });
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #0e1a10;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a2e1e; margin-bottom: 8px;">Reset your password</h1>
      <p style="font-size: 14px; color: #666; margin-bottom: 24px;">
        Click the button below to set a new password for your FlagstIQ account. This link expires in 1 hour.
      </p>
      <a href="${resetUrl}" style="display: inline-block; background-color: #2d5a27; color: white; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Reset Password
      </a>
      <p style="font-size: 12px; color: #999; margin-top: 32px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;
  await send(to, 'Reset your password — FlagstIQ', html);
}

export async function sendWelcomeEmail(to: string, displayName: string) {
  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #0e1a10;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a2e1e; margin-bottom: 8px;">Welcome to FlagstIQ, ${displayName}!</h1>
      <p style="font-size: 14px; color: #666; margin-bottom: 16px;">
        Your account has been created and is pending admin approval. You'll receive another email once your account is activated.
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 32px;">
        If you didn't create this account, you can safely ignore this email.
      </p>
    </div>
  `;
  await send(to, 'Welcome to FlagstIQ', html);
}

export async function sendAdminNotificationEmail(username: string, email: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    logger.info(`[EMAIL] No ADMIN_EMAIL set, skipping new-registration notification for ${username}`);
    return;
  }

  const appUrl = process.env.APP_URL || 'https://mjgolf.up.railway.app';
  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #0e1a10;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a2e1e; margin-bottom: 8px;">New Registration</h1>
      <p style="font-size: 14px; color: #666; margin-bottom: 16px;">
        <strong>${username}</strong> (${email}) just registered and is waiting for approval.
      </p>
      <a href="${appUrl}/admin" style="display: inline-block; background-color: #2d5a27; color: white; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Review in Admin
      </a>
    </div>
  `;
  await send(adminEmail, 'New FlagstIQ Registration — Pending Approval', html);
}

export async function sendAccountApprovedEmail(to: string, displayName: string) {
  const appUrl = process.env.APP_URL || 'https://mjgolf.up.railway.app';
  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #0e1a10;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a2e1e; margin-bottom: 8px;">You're in, ${displayName}!</h1>
      <p style="font-size: 14px; color: #666; margin-bottom: 24px;">
        Your FlagstIQ account has been approved. You can now sign in and start tracking your game.
      </p>
      <a href="${appUrl}" style="display: inline-block; background-color: #2d5a27; color: white; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Sign In
      </a>
    </div>
  `;
  await send(to, 'Your FlagstIQ account is approved!', html);
}
