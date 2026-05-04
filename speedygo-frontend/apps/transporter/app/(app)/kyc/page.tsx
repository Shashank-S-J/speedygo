'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { kycService, getApiError } from '@speedygo/api-client';
import { motion } from 'framer-motion';

export default function TransporterKYCPage() {
  const router = useRouter();
  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [dl, setDl] = useState('');
  const [docUrls, setDocUrls] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setError('');
    // Validate formats
    if (aadhaar && !/^\d{12}$/.test(aadhaar.replace(/[\s-]/g, ''))) {
      setError('Aadhaar must be 12 digits'); return;
    }
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan.toUpperCase().trim())) {
      setError('PAN must be in format ABCDE1234F'); return;
    }
    setLoading(true);
    try {
      await kycService.submit({
        aadhaar_number: aadhaar || undefined,
        pan_number: pan || undefined,
        dl_number: dl || undefined,
        doc_urls: docUrls.filter(Boolean),
      });
      setSuccess(true);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-16 space-y-4 animate-blur-fade-up">
        <div className="w-20 h-20 mx-auto rounded-full bg-tertiary/10 border border-tertiary/20 flex items-center justify-center shadow-[0_0_30px_rgba(76,215,246,0.3)]">
          <span className="material-symbols-outlined text-[40px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <h2 className="text-xl font-bold text-on-surface">KYC Submitted</h2>
        <p className="text-on-surface-variant text-sm">Your documents are under review.</p>
        <button onClick={() => router.push('/dashboard')} className="text-primary font-medium">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 max-w-lg mx-auto animate-blur-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-headline-md font-bold text-on-surface">Transporter KYC</h2>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        {[
          { value: aadhaar, set: setAadhaar, label: 'Aadhaar Number', placeholder: '1234 5678 9012', icon: 'credit_card' },
          { value: pan, set: setPan, label: 'PAN Number', placeholder: 'ABCDE1234F', icon: 'badge' },
          { value: dl, set: setDl, label: 'Driving License', placeholder: 'DL-0420140012345', icon: 'directions_car' },
        ].map((f) => (
          <div key={f.label}>
            <label className="block text-label-caps text-on-surface-variant mb-2">{f.label}</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">{f.icon}</span>
              <input value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder}
                className="w-full glass-input rounded-lg pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-outline" />
            </div>
          </div>
        ))}

        <div>
          <label className="block text-label-caps text-on-surface-variant mb-2">Document URLs</label>
          {docUrls.map((url, index) => (
            <input key={`doc-${index}`} value={url}
              onChange={(e) => setDocUrls((prev) => prev.map((v, i) => i === index ? e.target.value : v))}
              placeholder="https://..." className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline mb-2" />
          ))}
          {docUrls.length < 5 && (
            <button onClick={() => setDocUrls((prev) => [...prev, ''])} className="text-primary text-sm font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">add</span> Add document
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">{error}</div>}

      <motion.button whileTap={{ scale: 0.97 }} onClick={submit} disabled={loading || (!aadhaar && !pan)}
        className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-3 rounded-xl">
        {loading ? 'Submitting…' : 'Submit KYC'}
      </motion.button>
    </div>
  );
}

