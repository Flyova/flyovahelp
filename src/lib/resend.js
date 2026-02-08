import { Resend } from 'resend';

// This ensures the build doesn't crash if the key is missing during CI
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');

export const sendEmail = async (to, subject, html) => {
  try {
    const data = await resend.emails.send({
      from: 'Flyova Notifications <noreply@notify.flyovahelp.com>',
      to: [to],
      subject: subject,
      html: html,
    });
    return { success: true, data };
  } catch (error) {
    console.error("Resend Error:", error);
    return { success: false, error };
  }
};