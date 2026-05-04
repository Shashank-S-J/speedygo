'use client';
import { useAuthStore } from '@/store/authStore';
import { profileService, sosService, getApiError } from '@speedygo/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [error, setError] = useState('');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoTab, setPhotoTab] = useState<'camera' | 'upload' | 'url'>('upload');
  const [photoUrl, setPhotoUrl] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: contacts } = useQuery({ queryKey: ['sos-contacts'], queryFn: sosService.getContacts });

  const updateMut = useMutation({
    mutationFn: () => profileService.updateProfile({ full_name: name, phone }),
    onSuccess: (data) => { updateUser(data); setEditing(false); setError(''); },
    onError: (err) => setError(getApiError(err)),
  });

  const photoMut = useMutation({
    mutationFn: (fileOrUrl: File | string) => profileService.uploadPhoto(fileOrUrl),
    onSuccess: (data) => { updateUser(data.user); setShowPhotoModal(false); setCapturedPhoto(null); setPhotoUrl(''); stopCamera(); },
    onError: (err) => setError(getApiError(err)),
  });

  const photoUrlMut = useMutation({
    mutationFn: (url: string) => profileService.updateProfile({ profile_photo: url }),
    onSuccess: (data) => { updateUser(data); setShowPhotoModal(false); setPhotoUrl(''); },
    onError: (err) => setError(getApiError(err)),
  });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } });
      setCameraStream(stream);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 100);
    } catch { setError('Camera permission denied'); }
  };
  const stopCamera = () => { cameraStream?.getTracks().forEach((t) => t.stop()); setCameraStream(null); };
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const v = videoRef.current;
    const size = Math.min(v.videoWidth, v.videoHeight);
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 480, 480);
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Only image files allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Max 5MB'); return; }
    photoMut.mutate(file);
  };

  useEffect(() => { if (!showPhotoModal) { stopCamera(); setCapturedPhoto(null); setError(''); } }, [showPhotoModal]);

  return (
    <div className="space-y-6 pb-6 max-w-4xl mx-auto animate-blur-fade-up">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="relative group cursor-pointer" onClick={() => setShowPhotoModal(true)}>
            {user?.profile_photo ? (
              <img src={user.profile_photo} alt={user.full_name}
                className="w-20 h-20 rounded-full object-cover shadow-[0_0_20px_rgba(76,215,246,0.4)] border-2 border-tertiary/30" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-tertiary flex items-center justify-center text-3xl font-black text-white shadow-[0_0_20px_rgba(76,215,246,0.4)]">
                {user?.full_name?.[0]?.toUpperCase() ?? 'T'}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-white text-[20px]">photo_camera</span>
            </div>
            {user?.status === 'ACTIVE' && (
              <div className="absolute -bottom-1 -right-1 bg-surface-container border border-tertiary rounded-full p-0.5 shadow-lg">
                <span className="material-symbols-outlined text-tertiary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-headline-lg text-on-surface">{user?.full_name}</h1>
            <p className="text-on-surface-variant">{user?.email}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-label-caps text-[10px] ${
                user?.status === 'ACTIVE' ? 'bg-tertiary/10 text-tertiary border border-tertiary/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${user?.status === 'ACTIVE' ? 'bg-tertiary' : 'bg-yellow-400'}`} />
                {user?.status}
              </span>
              {(user as any)?.avg_rating && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                  <span className="material-symbols-outlined text-yellow-400 text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="text-[10px] font-bold text-yellow-400">{((user as any).avg_rating as number).toFixed(1)}</span>
                  <span className="text-[9px] text-on-surface-variant">({(user as any).total_ratings})</span>
                </span>
              )}
            </div>
          </div>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn-3d text-white text-label-caps px-6 py-3 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">edit</span> Edit
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Personal Info */}
        <section className="col-span-12 lg:col-span-8 glass-panel rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary text-2xl">person</span>
            <h2 className="text-headline-md text-on-surface">Personal Information</h2>
          </div>
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-label-caps text-on-surface-variant mb-2">Full Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="glass-input w-full px-4 py-3 rounded-lg text-on-surface" />
              </div>
              <div>
                <label className="block text-label-caps text-on-surface-variant mb-2">Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="glass-input w-full px-4 py-3 rounded-lg text-on-surface" />
              </div>
              {error && <p className="text-error text-sm">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}
                  className="btn-3d text-white px-6 py-2.5 rounded-lg text-label-caps disabled:opacity-50">
                  {updateMut.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-6 py-2.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-white/5 transition-colors text-label-caps">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                { label: 'Full Name', value: user?.full_name, icon: 'badge' },
                { label: 'Email', value: user?.email, icon: 'mail' },
                { label: 'Phone', value: user?.phone || 'Not set', icon: 'call' },
                { label: 'Role', value: user?.role, icon: 'work' },
              ].map((field) => (
                <div key={field.label} className="flex flex-col gap-2">
                  <label className="text-label-caps text-on-surface-variant">{field.label}</label>
                  <div className="bg-surface-container-lowest/80 border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface flex items-center gap-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                    <span className="material-symbols-outlined text-outline">{field.icon}</span>
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">shield_lock</span>
                <div>
                  <div className="text-on-surface font-medium">KYC Verification</div>
                  <div className={`text-xs ${user?.status === 'ACTIVE' ? 'text-tertiary' : 'text-yellow-400'}`}>
                    {user?.status === 'ACTIVE' ? 'Verified' : 'Pending'}
                  </div>
                </div>
              </div>
              {user?.status !== 'ACTIVE' && <Link href="/kyc" className="text-primary text-label-caps">Submit</Link>}
            </div>
          </div>

          <Link href="/vehicles" className="glass-panel rounded-2xl p-6 flex items-center gap-3 hover:border-primary/30 transition-colors block">
            <span className="material-symbols-outlined text-primary">local_shipping</span>
            <span className="text-on-surface font-medium">My Vehicles</span>
          </Link>

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error">emergency</span>
                <span className="text-on-surface font-medium">Emergency Contacts</span>
              </div>
              <span className="text-xs text-on-surface-variant">{contacts?.length ?? 0}/5</span>
            </div>
            {contacts?.map((c: any, i: number) => (
              <div key={i} className="text-sm text-on-surface-variant py-2 border-b border-white/5 last:border-0">{c.name} · {c.phone}</div>
            ))}
            <Link href="/sos/contacts" className="text-primary text-label-caps mt-3 block">Manage Contacts</Link>
          </div>

          <Link href="/profile/password" className="glass-panel rounded-2xl p-6 flex items-center gap-3 hover:border-primary/30 transition-colors block">
            <span className="material-symbols-outlined text-outline">key</span>
            <span className="text-on-surface font-medium">Change Password</span>
          </Link>

          <button onClick={logout}
            className="w-full glass-panel rounded-2xl p-6 flex items-center gap-3 text-error hover:bg-error-container/10 hover:border-error/30 transition-colors">
            <span className="material-symbols-outlined">logout</span>
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Photo Modal */}
      {showPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-on-surface">Profile Picture</h3>
              <button onClick={() => setShowPhotoModal(false)} className="text-outline hover:text-on-surface text-2xl">&times;</button>
            </div>
            <div className="flex gap-1 bg-surface-container-lowest/50 rounded-lg p-1">
              {(['camera', 'upload', 'url'] as const).map((tab) => (
                <button key={tab} onClick={() => { setPhotoTab(tab); if (tab === 'camera') startCamera(); else stopCamera(); }}
                  className={`flex-1 text-xs font-medium py-2 rounded-md transition-all flex items-center justify-center gap-1 ${photoTab === tab ? 'bg-primary/20 text-primary' : 'text-outline hover:text-on-surface'}`}>
                  <span className="material-symbols-outlined text-[14px]">{tab === 'camera' ? 'photo_camera' : tab === 'upload' ? 'upload_file' : 'link'}</span>
                  <span className="capitalize">{tab}</span>
                </button>
              ))}
            </div>

            {photoTab === 'camera' && (
              <div className="space-y-3">
                {!capturedPhoto ? (
                  <>
                    <div className="rounded-xl overflow-hidden bg-black aspect-square max-h-64 mx-auto">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    </div>
                    <button onClick={capturePhoto} disabled={!cameraStream}
                      className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">camera</span> Capture
                    </button>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl overflow-hidden aspect-square max-h-64 mx-auto">
                      <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setCapturedPhoto(null); startCamera(); }} className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm">Retake</button>
                      <button onClick={() => photoMut.mutate(capturedPhoto)} disabled={photoMut.isPending}
                        className="flex-1 btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                        {photoMut.isPending ? 'Saving…' : 'Use Photo'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {photoTab === 'upload' && (
              <div className="space-y-3">
                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileSelect} className="hidden" />
                <div onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-outline-variant/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-all">
                  <span className="material-symbols-outlined text-[40px] text-outline-variant block mb-2">cloud_upload</span>
                  <p className="text-sm text-on-surface-variant">Click to select a photo</p>
                  <p className="text-xs text-outline mt-1">JPEG, PNG, WebP · Max 5MB</p>
                </div>
                {photoMut.isPending && <div className="flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}
              </div>
            )}

            {photoTab === 'url' && (
              <div className="space-y-3">
                <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://example.com/photo.jpg"
                  className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
                {photoUrl && <div className="flex justify-center"><img src={photoUrl} alt="Preview" className="w-20 h-20 rounded-full object-cover border border-white/10" onError={(e) => (e.currentTarget.style.display = 'none')} /></div>}
                <button onClick={() => photoUrl.trim() && photoUrlMut.mutate(photoUrl.trim())} disabled={!photoUrl.trim() || photoUrlMut.isPending}
                  className="w-full btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                  {photoUrlMut.isPending ? 'Saving…' : 'Set Photo URL'}
                </button>
              </div>
            )}

            {error && <p className="text-error text-sm">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
