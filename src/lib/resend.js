import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'Flyovahelp <noreply@notify.flyovahelp.com>';

export const sendEmail = async (to, subject, html) => {
  try {
    if (!RESEND_API_KEY) {
      return {
        success: false,
        error: "Missing RESEND_API_KEY environment variable.",
      };
    }

    const resend = new Resend(RESEND_API_KEY);
    const data = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
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
