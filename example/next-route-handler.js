/**
 * Minimal Next.js App Router endpoint that works with the default uploader.
 * Drop it at: app/api/upload/route.js
 *
 * Answers with { ok: true, url } — which is exactly what SmartImageUploader
 * expects. Add your own auth check before saving anything.
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const ALLOWED = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

const MAX_SIZE = 8 * 1024 * 1024;

export async function POST(request) {
  // TODO: authenticate the caller here.

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const subfolder = String(formData?.get("subfolder") || "misc").replace(/[^a-z0-9-]/gi, "");

  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "File too large." }, { status: 400 });
  }

  const extension = ALLOWED[file.type];
  if (!extension) {
    return NextResponse.json({ ok: false, error: "Unsupported image type." }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", subfolder);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ ok: true, url: `/uploads/${subfolder}/${filename}` });
}
