import { useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface PhotoCaptureProps {
  onCapture: (file: File) => void;
}

export function PhotoCapture({ onCapture }: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clear = () => {
    setPreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const submit = () => {
    if (selectedFile) onCapture(selectedFile);
  };

  return (
    <div className="flex flex-col gap-4">
      {!preview ? (
        <>
          <p className="text-sm text-gray-400">
            Photograph the GC4 session table view, or choose an image from your gallery.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-700 p-6 text-gray-400 transition-colors hover:border-green-600 hover:text-green-400"
            >
              <Camera size={28} />
              <span className="text-sm">Take Photo</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-700 p-6 text-gray-400 transition-colors hover:border-green-600 hover:text-green-400"
            >
              <Upload size={28} />
              <span className="text-sm">Upload Image</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="relative">
            <img
              src={preview}
              alt="GC4 session screenshot"
              className="w-full rounded-xl border border-gray-700"
            />
            <button
              onClick={clear}
              className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-3">
            <Button onClick={submit} className="flex-1">
              Extract Shot Data
            </Button>
            <Button variant="secondary" onClick={clear}>
              Retake
            </Button>
          </div>
        </>
      )}

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
