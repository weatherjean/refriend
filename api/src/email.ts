/**
 * Email service using Scaleway Transactional Email (TEM) HTTP API
 *
 * Required environment variables:
 * - SCW_SECRET_KEY: Scaleway API secret key
 * - SCW_PROJECT_ID: Scaleway project ID
 * - SCW_REGION: Scaleway region (default: fr-par)
 * - EMAIL_FROM: Sender email address (e.g., noreply@yourdomain.com)
 * - APP_URL: Application URL for building reset links (e.g., https://yourdomain.com)
 */

interface EmailConfig {
  secretKey: string;
  projectId: string;
  region: string;
  fromEmail: string;
  appUrl: string;
}

function getConfig(): EmailConfig | null {
  const secretKey = Deno.env.get("SCW_SECRET_KEY");
  const projectId = Deno.env.get("SCW_PROJECT_ID");
  const fromEmail = Deno.env.get("EMAIL_FROM");
  const appUrl = Deno.env.get("APP_URL");

  if (!secretKey || !projectId || !fromEmail || !appUrl) {
    return null;
  }

  return {
    secretKey,
    projectId,
    region: Deno.env.get("SCW_REGION") || "fr-par",
    fromEmail,
    appUrl,
  };
}

interface ScalewayEmailRequest {
  from: {
    email: string;
    name?: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  text: string;
  html?: string;
  project_id: string;
}

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> {
  const config = getConfig();

  if (!config) {
    console.error("[Email] Email not configured (missing SCW_SECRET_KEY, SCW_PROJECT_ID, EMAIL_FROM, or APP_URL)");
    return false;
  }

  const url = `https://api.scaleway.com/transactional-email/v1alpha1/regions/${config.region}/emails`;

  const body: ScalewayEmailRequest = {
    from: {
      email: config.fromEmail,
      name: "Riff",
    },
    to: [{ email: to }],
    subject,
    text,
    html,
    project_id: config.projectId,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": config.secretKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Email] Scaleway API error: ${response.status} ${errorText}`);
      return false;
    }

    console.log(`[Email] Sent email to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send email:", error);
    return false;
  }
}

/**
 * Send a password reset email with a reset link
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string
): Promise<boolean> {
  const config = getConfig();
  if (!config) {
    console.error("[Email] Cannot send password reset - email not configured");
    return false;
  }

  const resetUrl = `${config.appUrl}/reset-password/${resetToken}`;

  const subject = "Reset your Riff password";

  const text = `Hi,

You requested to reset your password for your Riff account.

Click the link below to set a new password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, you can safely ignore this email.

- The Riff Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0d6efd;">Reset your password</h2>
  <p>Hi,</p>
  <p>You requested to reset your password for your Riff account.</p>
  <p>
    <a href="${resetUrl}" style="display: inline-block; background-color: #0d6efd; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
      Reset Password
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
  <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">- The Riff Team</p>
</body>
</html>`;

  return sendEmail(to, subject, text, html);
}

/**
 * Check if email is configured and available
 */
export function isEmailConfigured(): boolean {
  return getConfig() !== null;
}
