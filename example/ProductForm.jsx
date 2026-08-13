"use client";

import { useState } from "react";
import { SmartImageUploader } from "smart-image-uploader";

/** A typical product form field — English, LTR, default theme. */
export function ProductImageField() {
  const [image, setImage] = useState(null);

  return (
    <SmartImageUploader
      value={image}
      onChange={setImage}
      endpoint="/api/upload"
      extraFields={{ subfolder: "products" }}
      removeBackground
      maxEdge={1400}
      quality={0.8}
      onProcessed={(info) => console.log("saved", info)}
    />
  );
}

/** Same component, Persian labels and RTL. */
export function PersianField() {
  const [image, setImage] = useState(null);

  return (
    <SmartImageUploader
      value={image}
      onChange={setImage}
      endpoint="/api/upload"
      dir="rtl"
      locale="fa-IR"
      theme={{ accent: "#c67139", surface: "#fffaf3", track: "#ebddc5", border: "#e6d9c2" }}
      labels={{
        choose: "انتخاب عکس",
        replace: "تغییر عکس",
        remove: "حذف",
        empty: "بدون عکس",
        cutoutToggle: "حذف پس‌زمینهٔ یکدست",
        cutoutHint: "با زدن این تیک، همین عکس دوباره پردازش و جایگزین می‌شود.",
        cutoutLocked: "پس‌زمینه حذف شد. برای برگرداندنش باید یک عکس تازه انتخاب کنید.",
        reading: "در حال خواندن فایل",
        background: "در حال حذف پس‌زمینه",
        compressing: "در حال فشرده‌سازی تصویر",
        uploading: "در حال آپلود",
        done: "انجام شد",
        savedSuffix: "کمتر",
      }}
    />
  );
}

/** Uploading somewhere else entirely — the component only needs a URL back. */
export function CustomUploadTarget() {
  const [image, setImage] = useState(null);

  return (
    <SmartImageUploader
      value={image}
      onChange={setImage}
      upload={async (blob) => {
        const presigned = await fetch("/api/s3-url").then((r) => r.json());
        await fetch(presigned.uploadUrl, { method: "PUT", body: blob });
        return presigned.publicUrl;
      }}
    />
  );
}
