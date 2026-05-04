'use client';

import { useMutation } from '@tanstack/react-query';
import { profileService, getApiError } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';
import { useState, useRef, useEffect } from 'react';
import { AvatarConfig } from '@speedygo/types';

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

      ctx.beginPath(); ctx.arc(60, 60, 58, 0, Math.PI * 2);
      ctx.fillStyle = config?.background || '#1e293b'; ctx.fill();

      ctx.beginPath(); ctx.ellipse(cx, cy + 35, 25, 20, 0, Math.PI, 0, true);
      ctx.fillStyle = outfit; ctx.fill();

      ctx.beginPath(); ctx.arc(cx, cy - 5, 22, 0, Math.PI * 2);
      ctx.fillStyle = skinColor; ctx.fill();

      ctx.fillStyle = hairColor;
      const hairStyle = config?.hairStyle || 'short';
      if (hairStyle === 'short') { ctx.beginPath(); ctx.arc(cx, cy - 12, 22, Math.PI, 0); ctx.fill(); }
      else if (hairStyle === 'long') { ctx.beginPath(); ctx.arc(cx, cy - 12, 22, Math.PI * 0.8, Math.PI * 0.2); ctx.lineTo(cx + 20, cy + 15); ctx.lineTo(cx - 20, cy + 15); ctx.fill(); }
      else if (hairStyle === 'curly') { for (let i = 0; i < 8; i++) { const angle = (Math.PI / 8) * i + Math.PI; ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * 18, cy - 12 + Math.sin(angle) * 18, 8, 0, Math.PI * 2); ctx.fill(); } }

      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.ellipse(cx - 7, cy - 5, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 7, cy - 5, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = eyeColor;
      ctx.beginPath(); ctx.arc(cx - 7, cy - 4, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, cy - 4, 2.5, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = '#854d0e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy + 2, 8, 0.2, Math.PI - 0.2); ctx.stroke();

      if (animation === 'wave') {
        const waveAngle = Math.sin(frame * 0.1) * 0.3;
        ctx.save(); ctx.translate(cx + 22, cy + 20); ctx.rotate(-0.8 + waveAngle);
        ctx.fillStyle = skinColor; ctx.fillRect(-3, -15, 6, 15); ctx.restore();
      }

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

export default function AdminProfilePage() {
  const { user, logout, updateUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saveError, setSaveError] = useState('');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoTab, setPhotoTab] = useState<'upload' | 'url' | 'avatar'>('upload');
  const [photoUrl, setPhotoUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(
    user?.avatar_config ?? { type: 'initials', skinColor: '#ffcc99', hairStyle: 'short', hairColor: '#4a3728', eyeColor: '#2563eb', outfit: '#3b82f6', animation: 'idle', background: '#1e293b' }
  );

  // Password change
  const [showPwModal, setShowPwModal] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const updateMut = useMutation({
    mutationFn: () => profileService.updateProfile({ full_name: name, phone }),
    onSuccess: (data) => { updateUser(data); setEditing(false); setSaveError(''); },
    onError: (err: any) => setSaveError(getApiError(err)),
  });

  const photoMut = useMutation({
    mutationFn: (fileOrUrl: File | string) => profileService.uploadPhoto(fileOrUrl),
    onSuccess: (data) => { updateUser(data.user); setShowPhotoModal(false); setPhotoUrl(''); },
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

  const pwMut = useMutation({
    mutationFn: () => profileService.changePassword({ current_password: currentPw, new_password: newPw }),
    onSuccess: () => { setPwSuccess('Password changed successfully'); setPwError(''); setCurrentPw(''); setNewPw(''); },
    onError: (err: any) => setPwError(getApiError(err)),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setSaveError('Only image files allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setSaveError('Max 5MB'); return; }
    photoMut.mutate(file);
  };

  return (
    <div className="space-y-6 pb-6 max-w-4xl mx-auto animate-blur-fade-up">
      {/* Header Card */}
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
                {user?.full_name?.[0]?.toUpperCase() ?? 'A'}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-white text-[20px]">photo_camera</span>
            </div>
          </div>
          <div>
            <h1 className="text-headline-lg text-on-surface">{user?.full_name}</h1>
            <p className="text-on-surface-variant">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-label-caps text-[10px] ${
                user?.status === 'ACTIVE' ? 'bg-tertiary/10 text-tertiary border border-tertiary/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${user?.status === 'ACTIVE' ? 'bg-tertiary' : 'bg-yellow-400'}`} />
                {user?.status}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                {user?.role}
              </span>
            </div>
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
              {[
                { label: 'Full Name', icon: 'badge', value: user?.full_name },
                { label: 'Email', icon: 'mail', value: user?.email },
                { label: 'Phone', icon: 'call', value: user?.phone || 'Not set' },
                { label: 'Role', icon: 'admin_panel_settings', value: user?.role },
                { label: 'Member Since', icon: 'calendar_month', value: user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—' },
                { label: 'Last Login', icon: 'login', value: user?.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : '—' },
              ].map((f) => (
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
          {/* Change Password */}
          <button onClick={() => { setShowPwModal(true); setPwError(''); setPwSuccess(''); }}
            className="w-full glass-panel rounded-2xl p-6 flex items-center gap-3 hover:border-primary/30 transition-colors text-left">
            <span className="material-symbols-outlined text-outline">key</span>
            <span className="text-on-surface font-medium">Change Password</span>
          </button>

          {/* Account Info */}
          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary">shield</span>
              <span className="text-on-surface font-medium">Account Info</span>
            </div>
            <div className="text-sm text-on-surface-variant space-y-2">
              <div className="flex justify-between">
                <span>Warning Count</span>
                <span className="text-on-surface font-medium">{user?.warning_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Fraud Score</span>
                <span className="text-on-surface font-medium">{user?.fraud_score?.toFixed(3) ?? '0.000'}</span>
              </div>
            </div>
          </div>

          {/* Logout */}
          <button onClick={logout} className="w-full glass-panel rounded-2xl p-6 flex items-center gap-3 text-error hover:bg-error-container/10 hover:border-error/30 transition-colors">
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
              <button onClick={() => setShowPhotoModal(false)} className="text-outline hover:text-on-surface text-2xl leading-none">&times;</button>
            </div>

            <div className="flex gap-1 bg-surface-container-lowest/50 rounded-lg p-1">
              {(['upload', 'url', 'avatar'] as const).map((tab) => (
                <button key={tab} onClick={() => setPhotoTab(tab)}
                  className={`flex-1 text-xs font-medium py-2 px-1 rounded-md transition-all flex items-center justify-center gap-1 ${photoTab === tab ? 'bg-primary/20 text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}>
                  <span className="material-symbols-outlined text-[14px]">{tab === 'upload' ? 'upload_file' : tab === 'url' ? 'link' : 'face'}</span>
                  <span className="capitalize">{tab === 'avatar' ? '3D Avatar' : tab}</span>
                </button>
              ))}
            </div>

            {photoTab === 'upload' && (
              <div className="space-y-3">
                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileSelect} className="hidden" />
                <div onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-outline-variant/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-white/[0.02] transition-all">
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

            {photoTab === 'avatar' && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <AvatarPreview3D config={avatarConfig} name={user?.full_name ?? 'A'} />
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

      {/* Password Change Modal */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-on-surface">Change Password</h3>
              <button onClick={() => setShowPwModal(false)} className="text-outline hover:text-on-surface text-2xl leading-none">&times;</button>
            </div>
            <input value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} type="password" placeholder="Current password"
              className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
            <input value={newPw} onChange={(e) => setNewPw(e.target.value)} type="password" placeholder="New password"
              className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
            {pwError && <p className="text-error text-sm">{pwError}</p>}
            {pwSuccess && <p className="text-tertiary text-sm">{pwSuccess}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowPwModal(false)} className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm bg-surface-container">Cancel</button>
              <button onClick={() => pwMut.mutate()} disabled={!currentPw || !newPw || pwMut.isPending}
                className="flex-1 btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                {pwMut.isPending ? 'Changing…' : 'Change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

