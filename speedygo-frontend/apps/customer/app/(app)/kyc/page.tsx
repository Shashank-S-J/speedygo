'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { kycService, getApiError } from '@speedygo/api-client';

const STEPS = ['Personal', 'Documents', 'Upload', 'Review'];

export default function KYCPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [dl, setDl] = useState('');
  const [docUrls, setDocUrls] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError('');
    // Validate formats
    if (aadhaar && !/^\d{12}$/.test(aadhaar.replace(/[\s-]/g, ''))) {
      setError('Aadhaar must be 12 digits'); setLoading(false); return;
    }
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan.toUpperCase().trim())) {
      setError('PAN must be in format ABCDE1234F'); setLoading(false); return;
    }
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 animate-blur-fade-up">
        <div className="w-20 h-20 rounded-full bg-tertiary/10 border border-tertiary/20 flex items-center justify-center shadow-[0_0_30px_rgba(76,215,246,0.3)]">
          <span className="material-symbols-outlined text-[40px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <h2 className="text-headline-md font-bold text-on-surface">KYC Submitted</h2>
        <p className="text-on-surface-variant text-sm">Your documents are under review. We&apos;ll notify you when verified.</p>
        <button onClick={() => router.push('/dashboard')} className="text-primary font-medium mt-4 flex items-center gap-2 hover:text-tertiary transition-colors">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 max-w-lg mx-auto animate-blur-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-headline-md text-on-surface">KYC Verification</h1>
            <p className="text-sm text-on-surface-variant mt-1">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          </div>
        </div>

        {/* Progress Tracker */}
        <div className="flex items-center w-full h-8 relative">
          <div className="absolute left-0 right-0 h-[2px] bg-outline-variant/30 top-1/2 -translate-y-1/2 z-0" />
          <div className="absolute left-0 h-[2px] bg-primary-container top-1/2 -translate-y-1/2 z-0 shadow-[0_0_8px_rgba(77,142,255,0.8)] transition-all duration-500"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
          <div className="flex justify-between w-full z-10">
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => i <= step && setStep(i)}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  i < step
                    ? 'bg-primary-container shadow-[0_0_12px_rgba(77,142,255,0.5)]'
                    : i === step
                    ? 'bg-surface border-2 border-primary-container shadow-[0_0_12px_rgba(77,142,255,0.5)]'
                    : 'bg-surface-container border border-outline-variant'
                }`}>
                {i < step ? (
                  <span className="material-symbols-outlined text-on-primary-container text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                ) : i === step ? (
                  <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step Content */}
      {step === 0 && (
        <div className="glass-panel rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-tertiary">badge</span>
            <h2 className="text-body-lg text-on-surface font-semibold">Aadhaar Card</h2>
          </div>
          <div>
            <label className="block text-label-caps text-on-surface-variant mb-2">Aadhaar Number</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">credit_card</span>
              <input value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} placeholder="1234 5678 9012"
                className="w-full glass-input rounded-lg pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-outline" />
            </div>
          </div>
          <div>
            <label className="block text-label-caps text-on-surface-variant mb-2">PAN Number</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">badge</span>
              <input value={pan} onChange={(e) => setPan(e.target.value)} placeholder="ABCDE1234F"
                className="w-full glass-input rounded-lg pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-outline" />
            </div>
          </div>
          <button onClick={() => setStep(1)} disabled={!aadhaar && !pan}
            className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-3 rounded-xl mt-2">
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="glass-panel rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-tertiary/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-tertiary">directions_car</span>
            <h2 className="text-body-lg text-on-surface font-semibold">Driving License</h2>
            <span className="px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant text-[10px] font-label-caps uppercase tracking-wider ml-auto">Optional</span>
          </div>
          <div>
            <label className="block text-label-caps text-on-surface-variant mb-2">License Number</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">directions_car</span>
              <input value={dl} onChange={(e) => setDl(e.target.value)} placeholder="KA01-2020-0001234"
                className="w-full glass-input rounded-lg pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-outline" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep(0)}
              className="flex-1 border border-outline-variant/30 text-on-surface-variant py-3 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors">
              Back
            </button>
            <button onClick={() => setStep(2)}
              className="flex-1 btn-3d text-white font-semibold py-3 rounded-xl">
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="glass-panel rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary">cloud_upload</span>
            <h2 className="text-body-lg text-on-surface font-semibold">Document Upload</h2>
          </div>
          <p className="text-sm text-on-surface-variant">Upload documents to cloud storage first, then paste URLs below.</p>
          {docUrls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input value={url}
                onChange={(e) => { const next = [...docUrls]; next[i] = e.target.value; setDocUrls(next); }}
                placeholder="https://…"
                className="flex-1 glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
              {docUrls.length > 1 && (
                <button onClick={() => setDocUrls(docUrls.filter((_, j) => j !== i))}
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-variant/50 text-on-surface hover:bg-error-container hover:text-on-error-container transition-colors self-center">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              )}
            </div>
          ))}
          {docUrls.length < 5 && (
            <button onClick={() => setDocUrls([...docUrls, ''])}
              className="text-primary text-sm font-medium flex items-center gap-1 hover:text-tertiary transition-colors">
              <span className="material-symbols-outlined text-[16px]">add</span> Add document
            </button>
          )}
          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep(1)}
              className="flex-1 border border-outline-variant/30 text-on-surface-variant py-3 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors">
              Back
            </button>
            <button onClick={() => setStep(3)}
              className="flex-1 btn-3d text-white font-semibold py-3 rounded-xl">
              Review
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-body-lg text-on-surface font-semibold mb-2">Review & Submit</h2>
            <div className="space-y-2 text-sm">
              {aadhaar && (
                <div className="flex justify-between items-center p-3 bg-surface-container-lowest/50 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span className="text-on-surface-variant">Aadhaar</span>
                  </div>
                  <span className="text-on-surface font-medium">{aadhaar.slice(0, 4)}****{aadhaar.slice(-4)}</span>
                </div>
              )}
              {pan && (
                <div className="flex justify-between items-center p-3 bg-surface-container-lowest/50 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span className="text-on-surface-variant">PAN</span>
                  </div>
                  <span className="text-on-surface font-medium">{pan}</span>
                </div>
              )}
              {dl && (
                <div className="flex justify-between items-center p-3 bg-surface-container-lowest/50 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span className="text-on-surface-variant">DL</span>
                  </div>
                  <span className="text-on-surface font-medium">{dl}</span>
                </div>
              )}
              {docUrls.filter(Boolean).length > 0 && (
                <div className="flex justify-between items-center p-3 bg-surface-container-lowest/50 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span className="text-on-surface-variant">Documents</span>
                  </div>
                  <span className="text-on-surface font-medium">{docUrls.filter(Boolean).length} file(s)</span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)}
              className="flex-1 border border-outline-variant/30 text-on-surface-variant py-3 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors">
              Back
            </button>
            <button onClick={submit} disabled={loading || (!aadhaar && !pan)}
              className="flex-1 btn-3d disabled:opacity-50 text-white font-semibold py-4 rounded-xl text-label-caps uppercase tracking-wider">
              {loading ? 'Submitting…' : 'Submit KYC'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

