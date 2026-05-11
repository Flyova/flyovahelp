import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

cloudinary.config({
  cloud_name: "dbcggpk8o",
  api_key: "823961819667685",
  api_secret: "O0Z-RTVJvLmd5rVIzOQiaBNmdh8",
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: "blog/covers", resource_type: "image" },
        (err, res) => (err ? reject(err) : resolve(res))
      ).end(buffer);
    });

    return NextResponse.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { publicId } = await req.json();
    if (!publicId) return NextResponse.json({ error: "No publicId" }, { status: 400 });
    await cloudinary.uploader.destroy(publicId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Cloudinary delete error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
