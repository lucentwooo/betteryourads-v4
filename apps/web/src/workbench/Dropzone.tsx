import { useRef, type DragEvent, type ChangeEvent } from "react";
import { fileToDataUrl } from "./fileToDataUrl";

type DropzoneProps = {
  label: string;
  value: string | null;
  onPick: (dataUrl: string) => void;
  height?: number;
};

export function Dropzone({ label, value, onPick, height = 160 }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    onPick(await fileToDataUrl(file));
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    void handleFile(e.target.files?.[0]);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    void handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <label className="field" style={{ display: "block" }}>
      <span>{label}</span>
      <div
        className="dropzone"
        style={{ minHeight: height, display: "grid", placeItems: "center", cursor: "pointer" }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {value ? (
          <img src={value} alt={label} style={{ maxHeight: height, maxWidth: "100%", objectFit: "contain" }} />
        ) : (
          <span className="hint">Drag an image or click to upload</span>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} />
      </div>
    </label>
  );
}
