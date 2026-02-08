import { sendEmail } from "@/lib/resend";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { to, subject, html } = await req.json();

    // Basic validation
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const result = await sendEmail(to, subject, html);

    if (result.success) {
      return NextResponse.json({ message: "Email sent successfully", data: result.data }, { status: 200 });
    } else {
      console.error("Resend internal error:", result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}