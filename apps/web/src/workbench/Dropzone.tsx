import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { fileToDataUrl } from "./fileToDataUrl";
import { IconUpload } from "../ui/icons";

type DropzoneProps = {
  label: string;
  value: string | null;
  onPick: (dataUrl: string) => void;
  height?: number;
  required?: boolean;
};

export function Dropzone({ label, value, onPick, height = 160, required = false }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const id = `dz-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    onPick(await fileToDataUrl(file));
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    void handleFile(e.target.files?.[0]);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>
        {label}
        {required && <span style={{ color: "var(--bya-oxblood)", marginLeft: 4 }} aria-hidden="true">*</span>}
      </label>
      <button
        type="button"
        id={id}
        className={`dropzone${value ? " has-value" : ""}${dragging ? " is-dragging" : ""}`}
        style={{ minHeight: height, width: "100%" }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-label={value ? `${label} — selected, click to replace` : `${label} — click or drop an image to upload`}
      >
        {value ? (
          <img src={value} alt={label} style={{ maxHeight: height, maxWidth: "100%", objectFit: "contain", display: "block" }} />
        ) : (
          <span className="dz-hint" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
            <IconUpload className="ico" width={16} height={16} />
            Drag an image or click to upload
          </span>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} />
    </div>
  );
}
