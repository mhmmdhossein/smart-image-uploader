# smart-image-uploader

A React image uploader that does the heavy lifting **in the browser** before anything reaches your server:

- **Resize** — cap the longest edge (default 1600px)
- **Compress** — re-encode to WebP (default quality 0.82)
- **Remove a flat background** — optional one-click cut-out for product shots on a seamless backdrop
- **Stepped progress bar** — the user sees *reading → removing background → compressing → uploading*

No CSS framework. No runtime dependencies. Styling is inline and themed through a handful of values, so it drops into any React app and works in RTL.

Why browser-side? Because image processing on a small VPS or shared host costs RAM and latency you usually do not have. Here the work happens on the machine of the person uploading, and only the small final file crosses the network.

---

## Install

Copy `src/` into your project, or install from git:

```bash
npm install github:USERNAME/smart-image-uploader
```

Requires React 18+. Works with Next.js (App Router included — the component ships with `"use client"`).

## Usage

```jsx
import { SmartImageUploader } from "smart-image-uploader";

export default function ProductForm() {
  const [image, setImage] = useState(null);

  return (
    <SmartImageUploader
      value={image}
      onChange={setImage}
      endpoint="/api/upload"
      removeBackground
      maxEdge={1400}
      quality={0.8}
    />
  );
}
```

Your endpoint receives `multipart/form-data` with a `file` field and should answer with JSON containing a `url`:

```json
{ "ok": true, "url": "/uploads/products/abc.webp" }
```

### Bring your own uploader

Skip the built-in `fetch` entirely — useful for S3 presigned URLs, Cloudinary, or anything else:

```jsx
<SmartImageUploader
  value={image}
  onChange={setImage}
  upload={async (blob) => {
    const url = await uploadToS3(blob);
    return url; // whatever you return becomes the new value
  }}
/>
```

### Pipeline without the UI

```js
import { processImage } from "smart-image-uploader/pipeline";

const { blob, width, height, skipped } = await processImage(file, {
  maxEdge: 1600,
  quality: 0.82,
  removeBackground: true,
});
```

---

## Props

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `string \| null` | `null` | Current image URL |
| `onChange` | `(url \| null) => void` | — | Called after a successful upload or removal |
| `endpoint` | `string` | `"/api/upload"` | Where the built-in uploader POSTs |
| `fieldName` | `string` | `"file"` | Form-data field name |
| `extraFields` | `object` | `{}` | Extra form-data fields (e.g. `{ subfolder: "products" }`) |
| `headers` | `object` | — | Extra request headers |
| `upload` | `(blob, {file}) => Promise<string>` | — | Replaces the built-in uploader entirely |
| `compress` | `boolean` | `true` | Resize + re-encode. `false` uploads at original dimensions |
| `maxEdge` | `number` | `1600` | Longest-edge cap in pixels |
| `quality` | `number` | `0.82` | Encoder quality, 0–1 |
| `format` | `string` | `"image/webp"` | Output MIME type (falls back to PNG if unsupported) |
| `removeBackground` | `boolean` | `false` | Start with background removal enabled |
| `showBackgroundToggle` | `boolean` | `true` | Show the checkbox to the user |
| `backgroundOptions` | `{tolerance, softness}` | `{26, 18}` | Colour distance threshold and soft-edge band |
| `labels` | `object` | English | Every string is overridable |
| `theme` | `object` | see below | `accent`, `surface`, `muted`, `border`, `text`, `track`, `danger`, `radius` |
| `locale` | `string` | `"en"` | Number formatting (`"fa-IR"`, `"de-DE"`, …) |
| `dir` | `"ltr" \| "rtl"` | `"ltr"` | Text direction |
| `previewSize` | `number` | `80` | Thumbnail size in pixels |
| `disabled` | `boolean` | `false` | Disable all interaction |
| `onProcessed` | `(info) => void` | — | `{ url, before, after, width, height, skipped }` |
| `onError` | `(error) => void` | — | Raw error, in addition to the inline message |

### Persian / RTL example

```jsx
<SmartImageUploader
  dir="rtl"
  locale="fa-IR"
  labels={{
    choose: "انتخاب عکس",
    replace: "تغییر عکس",
    remove: "حذف",
    empty: "بدون عکس",
    cutoutToggle: "حذف پس‌زمینهٔ یکدست",
    cutoutHint: "با زدن این تیک، همین عکس دوباره پردازش می‌شود.",
    cutoutLocked: "پس‌زمینه حذف شد. برای برگرداندنش عکس تازه انتخاب کنید.",
    reading: "در حال خواندن فایل",
    background: "در حال حذف پس‌زمینه",
    compressing: "در حال فشرده‌سازی تصویر",
    uploading: "در حال آپلود",
    done: "انجام شد",
    savedSuffix: "کمتر",
  }}
  theme={{ accent: "#c67139", surface: "#fffaf3", track: "#ebddc5" }}
/>
```

---

## How background removal works

It is **not** an AI model — no download, no GPU, runs in tens of milliseconds.

The algorithm samples the border pixels, takes their average as the background colour, then flood-fills inward from every edge pixel. A pixel is cleared only when it is *both* close to that colour *and* connected to the border, so a white label in the middle of the product survives. Pixels just outside the tolerance fade out gradually instead of leaving a hard, jagged edge.

It deliberately refuses to run in two situations, returning the image untouched with a `skipped` reason:

| `skipped` | When | Why it matters |
| --- | --- | --- |
| `already-transparent` | The border is mostly transparent | The image is already a cut-out. Transparent pixels read as `rgb(0,0,0)` on canvas, so running anyway would treat **black** as the background and eat dark parts of the subject |
| `not-flat` | Border colours vary too much | A real scene, not a seamless backdrop — this method would shred it |

**Use it for:** product packshots, catalogue photos, anything on white/grey seamless.
**Do not use it for:** pets in a garden, people, busy scenes. For those you want a segmentation model such as `@imgly/background-removal`; you can plug one in by pre-processing the file and passing `removeBackground={false}`.

## Notes

- Background removal is one-way. Once applied, the checkbox locks until a new image is picked — the uploaded file no longer contains a background, so unticking could not bring it back.
- Output keeps an alpha channel, so after a cut-out the format must stay WebP or PNG. Adding alpha can make an already-small file slightly larger; the win shows up on real camera-sized originals.
- Each reprocess uploads a new file. The previous one is left on the server on purpose (something else may still reference it) — clean up with your own job if needed.

## License

MIT
