"use client";

import { Camera, CameraOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
type DetectorConstructor = new () => Detector;

export function IsbnScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "denied" | "missing" | "unsupported" | "not-found">("idle");
  const stop = () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); frameRef.current = null; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; setStatus("idle"); };
  const start = async () => {
    if (status === "scanning") { stop(); return; }
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorClass) { setStatus("unsupported"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("missing"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream; if (!videoRef.current) return; videoRef.current.srcObject = stream; await videoRef.current.play(); const detector = new DetectorClass(); setStatus("scanning");
      const scan = async () => { if (!videoRef.current || !streamRef.current) return; try { const result = await detector.detect(videoRef.current); const value = result.map((item) => item.rawValue?.replace(/[^0-9Xx]/g, "")).find((item) => item && (item.length === 10 || item.length === 13)); if (value) { onDetected(value); stop(); return; } } catch { /* the next frame may still be readable */ } frameRef.current = requestAnimationFrame(() => void scan()); };
      void scan();
    } catch (cause) { const name = (cause as DOMException).name; setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "missing" : "unsupported"); }
  };
  useEffect(() => () => stop(), []);
  const message = status === "denied" ? "摄像头权限被拒绝，请在浏览器设置中允许，或手动输入。" : status === "missing" ? "没有可用摄像头，已保留手动 ISBN 输入。" : status === "unsupported" ? "此浏览器不支持条码识别，请手动输入 ISBN。" : status === "not-found" ? "镜头中没有识别到 ISBN 条码。" : status === "scanning" ? "请把 ISBN 条码对准镜头。" : "可选：用摄像头识别 ISBN。";
  const Icon = status === "scanning" ? CameraOff : Camera;
  return <div className="mt-5 rounded-lg border border-border bg-paper-muted/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm leading-6 text-ink/65">{message}</p><Button type="button" variant="secondary" onClick={() => void start()}><Icon className="h-4 w-4" />{status === "scanning" ? "停止扫描" : "启动摄像头"}</Button></div>{status === "scanning" ? <video ref={videoRef} className="mt-4 aspect-video w-full rounded-lg bg-ink object-cover" muted playsInline aria-label="ISBN 摄像头预览" /> : null}</div>;
}
