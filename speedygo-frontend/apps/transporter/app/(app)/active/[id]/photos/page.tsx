'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingService, getApiError } from '@speedygo/api-client';
import type { PhotoStage } from '@speedygo/types';

export default function UploadPhotosPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = Number(params.id);
  const [stage, setStage] = useState<PhotoStage>('pickup');
  const [urls, setUrls] = useState(['']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const save = async () => {
    setError('');
    setSuccess('');
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    if (cleaned.length < 1 || cleaned.length > 10) {
      setError('Please provide 1 to 10 photo URLs');
      return;
    }
    setLoading(true);
    try {
      await bookingService.uploadPhotos(bookingId, { stage, urls: cleaned });
      setSuccess('Photos uploaded successfully');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-6 max-w-lg mx-auto animate-blur-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-headline-md font-bold text-on-surface">Upload Photos</h2>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-on-surface font-medium">
          <span className="material-symbols-outlined text-primary">photo_camera</span>
          Booking #{bookingId}
        </div>

        <div>
          <label className="block text-label-caps text-on-surface-variant mb-2">Photo Stage</label>
          <select value={stage} onChange={(e) => setStage(e.target.value as PhotoStage)}
            className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface">
            <option value="pickup">Pickup photos</option>
            <option value="delivery">Delivery photos</option>
          </select>
        </div>

        {urls.map((url, index) => (
          <div key={`photo-${index}`} className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrls((prev) => prev.map((v, i) => i === index ? e.target.value : v))}
              placeholder="https://..."
              className="flex-1 glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline"
            />
            {urls.length > 1 && (
              <button onClick={() => setUrls(urls.filter((_, i) => i !== index))}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-variant/50 text-on-surface hover:bg-error-container hover:text-on-error-container transition-colors self-center">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}
          </div>
        ))}

        {urls.length < 10 && (
          <button onClick={() => setUrls((prev) => [...prev, ''])}
            className="text-primary text-sm font-medium flex items-center gap-1 hover:text-tertiary transition-colors">
            <span className="material-symbols-outlined text-[16px]">add</span> Add another URL
          </button>
        )}

        {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">{error}</div>}
        {success && <div className="bg-tertiary/10 border border-tertiary/20 rounded-lg px-4 py-3 text-tertiary text-sm">{success}</div>}

        <button onClick={save} disabled={loading}
          className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-3 rounded-xl">
          {loading ? 'Uploading…' : 'Upload Photos'}
        </button>
      </div>
    </div>
  );
}

