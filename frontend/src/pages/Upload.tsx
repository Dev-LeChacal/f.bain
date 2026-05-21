import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { LocalFile } from "../lib/crypto";
import { formatFileSize } from "../lib/utils.ts";

type UploadStatus = "idle" | "uploading" | "error" | "success";

interface ProgressState {
  status: UploadStatus;
  text: string;
  progress: number;
}

const KEY_STRENGTH = 14;

const Upload = () => {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState<ProgressState>({ status: "idle", text: "", progress: 0 });
  const [maxFileSize, setMaxFileSize] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/max-filesize")
      .then((r) => r.json())
      .then((json) => setMaxFileSize(json.max));
  }, []);

  const handleFile = async (file: File) => {
    if (file.size >= maxFileSize) {
      setStatus("error");
      setProgress({ status: "error", text: "The file is too large", progress: 1 });
      return;
    }

    setStatus("uploading");
    setProgress({ status: "idle", text: "generating key", progress: 0 });

    const localFile = new LocalFile(file);
    let resp: { uuid: string; revocationToken: string; password: string };

    try {
      resp = await localFile.upload(
        KEY_STRENGTH,
        (p: { statusText?: string; progress?: number; status?: string }) => {
          setProgress((prev) => ({
            ...prev,
            text: p.statusText ?? prev.text,
            progress: p.progress ?? prev.progress,
            status: (p.status as UploadStatus) ?? prev.status,
          }));
        },
      );
    } catch (e) {
      setStatus("error");
      setProgress({ status: "error", text: String(e), progress: 1 });
      return;
    }

    setStatus("success");
    setProgress({ status: "success", text: "redirecting...", progress: 1 });

    setTimeout(() => {
      window.location.href = `/${resp.uuid}?rt=${resp.revocationToken}#${resp.password}`;
    }, 1500);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();

    const file = e.dataTransfer.items ? e.dataTransfer.items[0].getAsFile() : e.dataTransfer.files[0];

    if (file) void handleFile(file);
  };

  const progressColor =
    status === "error" ? "bg-red-500" : status === "success" ? "bg-green-500" : "bg-white";

  return (
    <div
      className="relative w-full h-screen cursor-pointer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={() => status === "idle" && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" className="hidden" onChange={onFileInput} />

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        {status === "idle" && (
          <>
            <img src="/upload.svg" alt="upload" className="mx-auto" />
            <p className="mt-2 text-gray-400">Click or drop to upload</p>
          </>
        )}

        {status !== "idle" && (
          <>
            <div className="w-75 h-4 bg-[#21212f] rounded-full px-1 mx-auto">
              <div
                className={`h-2 rounded-full transition-all duration-100 ${progressColor}`}
                style={{ width: `${progress.progress * 100}%` }}
              />
            </div>
            <p className="mt-2 text-gray-400">{progress.text}</p>
          </>
        )}
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
        <p className="text-sm text-gray-500">
          Max file size: <span className="text-white">{formatFileSize(maxFileSize)}</span>
        </p>
      </div>
    </div>
  );
};

export default Upload;
