"use client";

import { useMemo, useRef, useState } from "react";
import { processImage } from "./imagePipeline.js";

/**
 * SmartImageUploader
 * ------------------
 * Resize + compress (and optionally cut out a flat background) in the browser,
 * then upload the result — with a stepped progress bar.
 *
 * No CSS framework required: styles are inline and themed through a few CSS
 * variables (see `theme` prop). Every label is overridable, so it works in any
 * language and in RTL.
 */

const DEFAULT_LABELS = {
  choose: "Choose image",
  replace: "Replace image",
  remove: "Remove",
  empty: "No image",
  cutoutToggle: "Remove flat background",
  cutoutLocked: "Background removed. Pick a new image to start over.",
  cutoutHint: "Toggling this reprocesses the current image.",
  reading: "Reading file",
  background: "Removing background",
  compressing: "Compressing image",
  uploading: "Uploading",
  done: "Done",
  savedSuffix: "smaller",
  errorUpload: "Upload failed.",
  errorProcess: "Could not process the image.",
  errorReload: "Could not re-read the current image. Pick it again.",
  skippedAlreadyTransparent: "Image already has a transparent background — left unchanged.",
  skippedNotFlat: "Background is not uniform — left unchanged.",
};

const DEFAULT_THEME = {
  accent: "#c67139",
  surface: "#fffaf3",
  muted: "#6b6157",
  border: "#e6d9c2",
  text: "#201e1d",
  track: "#ebddc5",
  danger: "#dc2626",
  radius: "14px",
};

const STEPS = {
  reading: 12,
  background: 42,
  compressing: 68,
  uploading: 88,
  done: 100,
};

function formatBytes(bytes, locale) {
  if (!bytes) return "0";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb).toLocaleString(locale)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function SmartImageUploader({
  value = null,
  onChange,

  // upload
  endpoint = "/api/upload",
  fieldName = "file",
  extraFields = {},
  headers,
  upload, // (blob, {file}) => Promise<string>  — bring your own uploader (S3, etc.)

  // compression
  compress = true,
  maxEdge = 1600,
  quality = 0.82,
  format = "image/webp",

  // background removal
  removeBackground = false,
  showBackgroundToggle = true,
  backgroundOptions,

  // presentation
  labels: labelOverrides,
  theme: themeOverrides,
  locale = "en",
  dir = "ltr",
  disabled = false,
  previewSize = 80,
  className,
  style,

  onError,
  onProcessed,
}) {
  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...labelOverrides }), [labelOverrides]);
  const theme = useMemo(() => ({ ...DEFAULT_THEME, ...themeOverrides }), [themeOverrides]);

  const [step, setStep] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState(null);
  const [cutout, setCutout] = useState(removeBackground);
  const [cutoutApplied, setCutoutApplied] = useState(false);

  const inputRef = useRef(null);
  const sourceRef = useRef(null); // keeps the original File for reprocessing

  const busy = step !== null && step !== "done";

  // Give the browser a frame to paint the progress bar before the next
  // (synchronous, CPU-heavy) stage blocks the main thread.
  const paint = (next) =>
    new Promise((resolve) => {
      setStep(next);
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

  async function run(file, withCutout) {
    setError("");
    setNotice("");
    setStats(null);
    const originalSize = file.size;

    try {
      await paint("reading");
      if (withCutout) await paint("background");
      else if (compress) await paint("compressing");

      const { blob, width, height, skipped } = await processImage(file, {
        maxEdge: compress ? maxEdge : 0,
        quality,
        format,
        removeBackground: withCutout,
        backgroundOptions,
      });

      if (withCutout && !skipped) await paint("compressing");
      if (skipped) {
        setNotice(
          skipped === "already-transparent"
            ? labels.skippedAlreadyTransparent
            : labels.skippedNotFlat
        );
      }

      await paint("uploading");
      const uploadedUrl = upload
        ? await upload(blob, { file })
        : await defaultUpload(blob);

      setStats({ before: originalSize, after: blob.size, width, height });
      if (withCutout && !skipped) setCutoutApplied(true);

      await paint("done");
      onChange?.(uploadedUrl);
      onProcessed?.({ url: uploadedUrl, before: originalSize, after: blob.size, width, height, skipped });
      setTimeout(() => setStep(null), 1200);
    } catch (err) {
      const message = err?.message === "UPLOAD_FAILED" ? labels.errorUpload : labels.errorProcess;
      setError(message);
      onError?.(err);
      setStep(null);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function defaultUpload(blob) {
    const extension = (format.split("/")[1] || "webp").replace("jpeg", "jpg");
    const formData = new FormData();
    formData.append(fieldName, new File([blob], `image.${extension}`, { type: blob.type }));
    for (const [key, val] of Object.entries(extraFields)) formData.append(key, val);

    const res = await fetch(endpoint, { method: "POST", body: formData, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error("UPLOAD_FAILED");
    return data.url ?? data.path ?? data;
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    sourceRef.current = file;
    setCutoutApplied(false);
    await run(file, cutout);
  }

  async function handleToggle(checked) {
    if (cutoutApplied || busy) return;
    setCutout(checked);
    if (!value) return;

    let file = sourceRef.current;
    if (!file) {
      try {
        const res = await fetch(value);
        const blob = await res.blob();
        file = new File([blob], "current", { type: blob.type });
      } catch (err) {
        setError(labels.errorReload);
        onError?.(err);
        return;
      }
    }
    await run(file, checked);
  }

  const progress = step ? STEPS[step] : 0;

  const box = {
    width: previewSize,
    height: previewSize,
    borderRadius: theme.radius,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    overflow: "hidden",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const button = {
    borderRadius: 999,
    border: `1px solid ${theme.border}`,
    background: "transparent",
    color: theme.text,
    padding: "8px 16px",
    fontSize: 14,
    cursor: busy || disabled ? "not-allowed" : "pointer",
    opacity: busy || disabled ? 0.6 : 1,
  };

  return (
    <div dir={dir} className={className} style={{ color: theme.text, ...style }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <div style={box}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontSize: 12, color: theme.muted }}>{labels.empty}</span>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <label style={button}>
            {value ? labels.replace : labels.choose}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              disabled={busy || disabled}
              style={{ display: "none" }}
            />
          </label>

          {value && !busy && (
            <button
              type="button"
              onClick={() => {
                sourceRef.current = null;
                setCutoutApplied(false);
                setStats(null);
                onChange?.(null);
              }}
              style={{ ...button, color: theme.danger }}
            >
              {labels.remove}
            </button>
          )}
        </div>
      </div>

      {showBackgroundToggle && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            fontSize: 14,
            color: cutoutApplied ? theme.muted : theme.text,
            cursor: cutoutApplied || busy ? "not-allowed" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={cutout}
            disabled={busy || cutoutApplied || disabled}
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ accentColor: theme.accent, width: 16, height: 16 }}
          />
          {labels.cutoutToggle}
        </label>
      )}

      {showBackgroundToggle && value && !busy && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: theme.muted }}>
          {cutoutApplied ? labels.cutoutLocked : labels.cutoutHint}
        </p>
      )}

      {step && (
        <div style={{ marginTop: 12 }} role="status" aria-live="polite">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            <span style={{ fontWeight: 500 }}>{labels[step]}…</span>
            <span style={{ color: theme.muted }}>{progress.toLocaleString(locale)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: theme.track, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: theme.accent,
                borderRadius: 999,
                transition: "width 300ms ease-out",
              }}
            />
          </div>
        </div>
      )}

      {stats && !busy && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: theme.muted }}>
          {formatBytes(stats.before, locale)} → {formatBytes(stats.after, locale)} (
          {Math.round((1 - stats.after / stats.before) * 100).toLocaleString(locale)}%{" "}
          {labels.savedSuffix}) · {stats.width}×{stats.height}
        </p>
      )}

      {notice && <p style={{ margin: "8px 0 0", fontSize: 12, color: theme.muted }}>{notice}</p>}
      {error && <p style={{ margin: "8px 0 0", fontSize: 13, color: theme.danger }}>{error}</p>}
    </div>
  );
}
