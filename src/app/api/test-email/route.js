import { sendEmail } from "@/lib/resend";
import { NextResponse } from "next/server";

export async function GET() {
  const testEmail = "jupiterdigitalagency01@gmail.com"; // Change to your email
  
  const result = await sendEmail(
    testEmail, 
    "StraWins Test Connection ✅", 
    "<h1>It Works!</h1><p>Resend is officially connected to StraWins via Vercel.</p>"
  );

  return NextResponse.json(result);
}