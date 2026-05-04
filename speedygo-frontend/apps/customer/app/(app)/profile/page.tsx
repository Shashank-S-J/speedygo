'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { profileService, sosService, getApiError } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { AvatarConfig } from '@speedygo/types';

// ─── Permission Utilities ───

async function requestLocationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!navigator.geolocation) return 'denied';
  try {
    const perm = await navigator.permissions.query({ name: 'geolocation' });
    if (perm.state === 'prompt' || perm.state === 'granted') {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          () => resolve('denied'),
          { timeout: 10000 }
        );
      });
    }
    return perm.state;
  } catch {
    return 'prompt';
  }
}

async function requestCameraPermission(): Promise<'granted' | 'denied'> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch {
    return 'denied';
  }
}

// ─── 3D Avatar Preview Component ───

function AvatarPreview3D({ config, name }: { config?: AvatarConfig; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const skinColor = config?.skinColor || '#ffcc99';
    const hairColor = config?.hairColor || '#4a3728';
    const eyeColor = config?.eyeColor || '#2563eb';
    const outfit = config?.outfit || '#3b82f6';
    const animation = config?.animation || 'idle';

    let frame = 0;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, 120, 120);

      const bounce = animation === 'bounce' ? Math.sin(frame * 0.05) * 3 :
                     animation === 'wave' ? Math.sin(frame * 0.03) * 2 :
                     animation === 'dance' ? Math.sin(frame * 0.08) * 4 :
                     Math.sin(frame * 0.02) * 1;

      const cx = 60, cy = 55 + bounce;

      // Background
      ctx.beginPath();
      ctx.arc(60, 60, 58, 0, Math.PI * 2);
      ctx.fillStyle = config?.background || '#1e293b';
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.ellipse(cx, cy + 35, 25, 20, 0, Math.PI, 0, true);
      ctx.fillStyle = outfit;
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(cx, cy - 5, 22, 0, Math.PI * 2);
      ctx.fillStyle = skinColor;
      ctx.fill();

      // Hair
      ctx.fillStyle = hairColor;
      const hairStyle = config?.hairStyle || 'short';
      if (hairStyle === 'short') {
        ctx.beginPath(); ctx.arc(cx, cy - 12, 22, Math.PI, 0); ctx.fill();
      } else if (hairStyle === 'long') {
        ctx.beginPath(); ctx.arc(cx, cy - 12, 22, Math.PI * 0.8, Math.PI * 0.2);
        ctx.lineTo(cx + 20, cy + 15); ctx.lineTo(cx - 20, cy + 15); ctx.fill();
      } else if (hairStyle === 'curly') {
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI / 8) * i + Math.PI;
          ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * 18, cy - 12 + Math.sin(angle) * 18, 8, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Eyes
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.ellipse(cx - 7, cy - 5, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 7, cy - 5, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = eyeColor;
      ctx.beginPath(); ctx.arc(cx - 7, cy - 4, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, cy - 4, 2.5, 0, Math.PI * 2); ctx.fill();

      // Smile
      ctx.strokeStyle = '#854d0e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy + 2, 8, 0.2, Math.PI - 0.2); ctx.stroke();

      // Wave arm
      if (animation === 'wave') {
        const waveAngle = Math.sin(frame * 0.1) * 0.3;
        ctx.save(); ctx.translate(cx + 22, cy + 20); ctx.rotate(-0.8 + waveAngle);
        ctx.fillStyle = skinColor; ctx.fillRect(-3, -15, 6, 15); ctx.restore();
      }

      // Accessory
      if (config?.accessory === 'glasses') {
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx - 7, cy - 5, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + 7, cy - 5, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 1, cy - 5); ctx.lineTo(cx + 1, cy - 5); ctx.stroke();
      } else if (config?.accessory === 'hat') {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(cx - 18, cy - 30, 36, 8); ctx.fillRect(cx - 12, cy - 42, 24, 14);
      }

      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [config, name]);

  return <canvas ref={canvasRef} width={120} height={120} className="rounded-full" />;
}

// ─── Profile Page ───

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saveError, setSaveError] = useState('');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoTab, setPhotoTab] = useState<'camera' | 'upload' | 'url' | 'avatar'>('upload');
  const [photoUrl, setPhotoUrl] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [cameraStatus, setCameraStatus] = useState('');
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(
    user?.avatar_config ?? { type: 'initials', skinColor: '#ffcc99', hairStyle: 'short', hairColor: '#4a3728', eyeColor: '#2563eb', outfit: '#3b82f6', animation: 'idle', background: '#1e293b' }
  );

  const { data: contacts } = useQuery({ queryKey: ['sos-contacts'], queryFn: sosService.getContacts });

  const updateMut = useMutation({
    mutationFn: () => profileService.updateProfile({ full_name: name, phone }),
    onSuccess: (data) => { updateUser(data); setEditing(false); },
    onError: (err: any) => setSaveError(getApiError(err)),
  });

  const photoMut = useMutation({
    mutationFn: (fileOrUrl: File | string) => profileService.uploadPhoto(fileOrUrl),
    onSuccess: (data) => { updateUser(data.user); setShowPhotoModal(false); setCapturedPhoto(null); setPhotoUrl(''); stopCamera(); },
    onError: (err: any) => setSaveError(getApiError(err)),
  });

  const photoUrlMut = useMutation({
    mutationFn: (url: string) => profileService.updateProfile({ profile_photo: url }),
    onSuccess: (data) => { updateUser(data); setShowPhotoModal(false); setPhotoUrl(''); },
    onError: (err: any) => setSaveError(getApiError(err)),
  });

  const avatarMut = useMutation({
    mutationFn: (config: AvatarConfig) => profileService.updateProfile({ avatar_config: config } as any),
    onSuccess: (data) => { updateUser(data); setShowPhotoModal(false); },
    onError: (err: any) => setSaveError(getApiError(err)),
  });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } });
      setCameraStream(stream);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 100);
      setCameraStatus('');
    } catch { setCameraStatus('Camera permission denied. Enable in browser settings.'); }
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
    if (!file.type.startsWith('image/')) { setSaveError('Only image files allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setSaveError('Max 5MB'); return; }
    photoMut.mutate(file);
  };

  useEffect(() => { if (!showPhotoModal) { stopCamera(); setCapturedPhoto(null); setSaveError(''); } }, [showPhotoModal]);

  return (
    <div className="space-y-6 pb-6 max-w-4xl mx-auto animate-blur-fade-up">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="relative group cursor-pointer" onClick={() => setShowPhotoModal(true)}>
            {user?.avatar_config?.type === 'avatar' ? (
              <AvatarPreview3D config={user.avatar_config} name={user.full_name} />
            ) : user?.profile_photo ? (
              <img src={user.profile_photo} alt={user.full_name}
                className="w-20 h-20 rounded-full object-cover shadow-[0_0_20px_rgba(76,215,246,0.4)] border-2 border-tertiary/30" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-tertiary flex items-center justify-center text-3xl font-black text-white shadow-[0_0_20px_rgba(76,215,246,0.4)]">
                {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-white text-[20px]">photo_camera</span>
            </div>
          </div>
          <div>
            <h1 className="text-headline-lg text-on-surface">{user?.full_name}</h1>
            <p className="text-on-surface-variant">{user?.email}</p>
            <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-label-caps text-[10px] ${
              user?.status === 'ACTIVE'
                ? 'bg-tertiary/10 text-tertiary border border-tertiary/20'
                : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${user?.status === 'ACTIVE' ? 'bg-tertiary' : 'bg-yellow-400'}`} />
              {user?.status}
            </span>
          </div>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn-3d text-white text-label-caps px-6 py-3 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Edit Profile
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
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="glass-input w-full px-4 py-3 rounded-lg text-on-surface" />
              </div>
              <div>
                <label className="block text-label-caps text-on-surface-variant mb-2">Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." className="glass-input w-full px-4 py-3 rounded-lg text-on-surface" />
              </div>
              {saveError && <p className="text-error text-sm">{saveError}</p>}
              <div className="flex gap-3">
                <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending} className="btn-3d text-white px-6 py-2.5 rounded-lg text-label-caps disabled:opacity-50">
                  {updateMut.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditing(false)} className="px-6 py-2.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-white/5 transition-colors text-label-caps">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[{ label: 'Full Name', icon: 'badge', value: user?.full_name }, { label: 'Email', icon: 'mail', value: user?.email }, { label: 'Phone', icon: 'call', value: user?.phone || 'Not set' }, { label: 'Role', icon: 'work', value: user?.role }].map((f) => (
                <div key={f.label} className="flex flex-col gap-2">
                  <label className="text-label-caps text-on-surface-variant">{f.label}</label>
                  <div className="bg-surface-container-lowest/80 border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface flex items-center gap-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                    <span className="material-symbols-outlined text-outline">{f.icon}</span>{f.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Permissions */}
          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary">settings</span>
              <span className="text-on-surface font-medium">Permissions</span>
            </div>
            <button onClick={async () => { setLocationStatus('Requesting...'); const r = await requestLocationPermission(); setLocationStatus(r === 'granted' ? '✓ Enabled' : '✗ Denied – enable in settings'); }}
              className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <span className="material-symbols-outlined text-outline text-[18px]">my_location</span>
              <div className="flex-1">
                <div className="text-sm text-on-surface">Location</div>
                {locationStatus && <div className={`text-xs ${locationStatus.startsWith('✓') ? 'text-tertiary' : locationStatus.startsWith('✗') ? 'text-error' : 'text-outline'}`}>{locationStatus}</div>}
              </div>
            </button>
            <button onClick={async () => { const r = await requestCameraPermission(); setCameraStatus(r === 'granted' ? '✓ Enabled' : '✗ Denied'); }}
              className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <span className="material-symbols-outlined text-outline text-[18px]">photo_camera</span>
              <div className="flex-1">
                <div className="text-sm text-on-surface">Camera</div>
                {cameraStatus && !showPhotoModal && <div className={`text-xs ${cameraStatus.startsWith('✓') ? 'text-tertiary' : 'text-error'}`}>{cameraStatus}</div>}
              </div>
            </button>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">shield_lock</span>
                <div>
                  <div className="text-on-surface font-medium">KYC Verification</div>
                  <div className={`text-xs ${user?.status === 'ACTIVE' ? 'text-tertiary' : 'text-yellow-400'}`}>{user?.status === 'ACTIVE' ? 'Verified' : user?.status ?? 'Pending'}</div>
                </div>
              </div>
              {user?.status !== 'ACTIVE' && <Link href="/kyc" className="text-primary text-label-caps hover:text-tertiary transition-colors">Submit</Link>}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error">emergency</span>
                <span className="text-on-surface font-medium">Emergency Contacts</span>
              </div>
              <span className="text-xs text-on-surface-variant">{contacts?.length ?? 0}/5</span>
            </div>
            {contacts?.map((c: any, i: number) => (
              <div key={`ec-${i}`} className="text-sm text-on-surface-variant py-2 border-b border-white/5 last:border-0">{c.name} · {c.phone}</div>
            ))}
            <Link href="/sos/contacts" className="text-primary text-label-caps mt-3 block hover:text-tertiary transition-colors">Manage Contacts</Link>
          </div>

          <Link href="/profile/password" className="glass-panel rounded-2xl p-6 flex items-center gap-3 hover:border-primary/30 transition-colors block">
            <span className="material-symbols-outlined text-outline">key</span>
            <span className="text-on-surface font-medium">Change Password</span>
          </Link>

          <button onClick={logout} className="w-full glass-panel rounded-2xl p-6 flex items-center gap-3 text-error hover:bg-error-container/10 hover:border-error/30 transition-colors">
            <span className="material-symbols-outlined">logout</span>
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* ═══════ Enhanced Photo Modal ═══════ */}
      {showPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-on-surface">Profile Picture</h3>
              <button onClick={() => setShowPhotoModal(false)} className="text-outline hover:text-on-surface text-2xl leading-none">&times;</button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surface-container-lowest/50 rounded-lg p-1">
              {(['camera', 'upload', 'url', 'avatar'] as const).map((tab) => (
                <button key={tab} onClick={() => { setPhotoTab(tab); if (tab === 'camera') startCamera(); else stopCamera(); }}
                  className={`flex-1 text-xs font-medium py-2 px-1 rounded-md transition-all flex items-center justify-center gap-1 ${photoTab === tab ? 'bg-primary/20 text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}>
                  <span className="material-symbols-outlined text-[14px]">{tab === 'camera' ? 'photo_camera' : tab === 'upload' ? 'upload_file' : tab === 'url' ? 'link' : 'face'}</span>
                  <span className="hidden sm:inline capitalize">{tab === 'avatar' ? '3D Avatar' : tab}</span>
                </button>
              ))}
            </div>

            {/* Camera */}
            {photoTab === 'camera' && (
              <div className="space-y-3">
                {cameraStatus && <p className="text-error text-sm text-center">{cameraStatus}</p>}
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
                      <button onClick={() => { setCapturedPhoto(null); startCamera(); }} className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm bg-surface-container">Retake</button>
                      <button onClick={() => photoMut.mutate(capturedPhoto)} disabled={photoMut.isPending}
                        className="flex-1 btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                        {photoMut.isPending ? 'Saving…' : 'Use Photo'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Upload */}
            {photoTab === 'upload' && (
              <div className="space-y-3">
                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileSelect} className="hidden" />
                <div onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-outline-variant/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-white/[0.02] transition-all">
                  <span className="material-symbols-outlined text-[40px] text-outline-variant block mb-2">cloud_upload</span>
                  <p className="text-sm text-on-surface-variant">Click to select or take a photo</p>
                  <p className="text-xs text-outline mt-1">JPEG, PNG, WebP · Max 5MB</p>
                </div>
                {photoMut.isPending && <div className="flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}
              </div>
            )}

            {/* URL */}
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

            {/* 3D Avatar */}
            {photoTab === 'avatar' && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <AvatarPreview3D config={avatarConfig} name={user?.full_name ?? 'U'} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="block text-label-caps text-on-surface-variant mb-1">Skin</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {['#ffe0bd', '#ffcc99', '#deb887', '#c68642', '#8d5524', '#4a2c0a'].map((c) => (
                        <button key={c} onClick={() => setAvatarConfig({ ...avatarConfig, type: 'avatar', skinColor: c })}
                          className={`w-6 h-6 rounded-full border-2 ${avatarConfig.skinColor === c ? 'border-primary scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-caps text-on-surface-variant mb-1">Hair Style</label>
                    <select value={avatarConfig.hairStyle ?? 'short'} onChange={(e) => setAvatarConfig({ ...avatarConfig, type: 'avatar', hairStyle: e.target.value })}
                      className="w-full glass-input rounded px-2 py-1 text-xs text-on-surface">
                      <option value="short">Short</option><option value="long">Long</option><option value="curly">Curly</option><option value="bald">Bald</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-caps text-on-surface-variant mb-1">Hair Color</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {['#1a1a2e', '#4a3728', '#8b4513', '#daa520', '#cd853f', '#dc143c'].map((c) => (
                        <button key={c} onClick={() => setAvatarConfig({ ...avatarConfig, type: 'avatar', hairColor: c })}
                          className={`w-6 h-6 rounded-full border-2 ${avatarConfig.hairColor === c ? 'border-primary scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-caps text-on-surface-variant mb-1">Eyes</label>
                    <div className="flex gap-1.5">
                      {['#2563eb', '#059669', '#92400e', '#1e293b', '#7c3aed'].map((c) => (
                        <button key={c} onClick={() => setAvatarConfig({ ...avatarConfig, type: 'avatar', eyeColor: c })}
                          className={`w-5 h-5 rounded-full border-2 ${avatarConfig.eyeColor === c ? 'border-primary scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-caps text-on-surface-variant mb-1">Outfit</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#1e293b'].map((c) => (
                        <button key={c} onClick={() => setAvatarConfig({ ...avatarConfig, type: 'avatar', outfit: c })}
                          className={`w-6 h-6 rounded-full border-2 ${avatarConfig.outfit === c ? 'border-primary scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-caps text-on-surface-variant mb-1">Accessory</label>
                    <select value={avatarConfig.accessory ?? ''} onChange={(e) => setAvatarConfig({ ...avatarConfig, type: 'avatar', accessory: e.target.value || undefined })}
                      className="w-full glass-input rounded px-2 py-1 text-xs text-on-surface">
                      <option value="">None</option><option value="glasses">Glasses</option><option value="hat">Hat</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-label-caps text-on-surface-variant mb-1">Animation</label>
                    <div className="flex gap-2 flex-wrap">
                      {(['idle', 'wave', 'bounce', 'dance'] as const).map((a) => (
                        <button key={a} onClick={() => setAvatarConfig({ ...avatarConfig, type: 'avatar', animation: a })}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${avatarConfig.animation === a ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-container text-outline border border-transparent'}`}>{a}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => avatarMut.mutate({ ...avatarConfig, type: 'avatar' })} disabled={avatarMut.isPending}
                  className="w-full btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                  {avatarMut.isPending ? 'Saving…' : 'Save 3D Avatar'}
                </button>
              </div>
            )}

            {saveError && <p className="text-error text-sm">{saveError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
