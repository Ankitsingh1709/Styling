import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

/**
 * Live camera capture via getUserMedia, with a still frame captured to a PNG
 * Blob. Falls back with a message when no camera is available — the parent
 * still offers the photo picker.
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
      .catch(() => setError("No camera available on this device."));

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
      <div className="notice is-error" role="alert">
        <Icon name="alert" size={21} className="notice-icon" />
        <div>
          <strong className="t-headline">{error}</strong>
          <p className="t-foot">Choose a photo from your library instead.</p>
        </div>
        <button className="btn btn-plain btn-small" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="shot">
        <video ref={videoRef} autoPlay playsInline muted />
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary grow" onClick={capture}>
          <Icon name="camera" size={20} />
          Take photo
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
