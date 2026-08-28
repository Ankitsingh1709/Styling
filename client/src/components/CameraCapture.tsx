import { useEffect, useRef, useState } from "react";

/**
 * Live camera capture. Opens the device camera via getUserMedia, shows a live
 * preview, and captures a still frame to a PNG Blob when the user taps Capture.
 * Falls back gracefully (with a message) when no camera is available — the
 * parent still offers file upload.
 */
export default function CameraCapture({
  onCapture,
  onCancel,
}: {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError("Camera unavailable — use Upload instead."));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    // Before the stream delivers a frame the video is 0x0 and toBlob yields
    // null — the button would look dead. Wait for real dimensions instead.
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      setError("Camera still warming up — try again in a second.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob), "image/png");
  }

  if (error) {
    return (
      <div className="card">
        <p className="muted">{error}</p>
        <button onClick={onCancel}>Back</button>
      </div>
    );
  }

  return (
    <div>
      <video ref={videoRef} className="preview" autoPlay playsInline muted />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" style={{ flex: 1 }} onClick={capture}>
          Capture
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
