'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sosService, getApiError } from '@speedygo/api-client';
import { EmergencyContact } from '@speedygo/types';

const emptyContact = (): EmergencyContact => ({ name: '', phone: '', email: '' });

export default function TransporterContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<EmergencyContact[]>([emptyContact()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    sosService.getContacts().then((data) => {
      setContacts(data.length ? data : [emptyContact()]);
    }).catch(() => {});
  }, []);

  const updateContact = (index: number, patch: Partial<EmergencyContact>) => {
    setContacts((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  };

  const save = async () => {
    setError(''); setSuccess('');
    const cleaned = contacts.map((c) => ({ name: c.name.trim(), phone: c.phone.trim(), email: c.email?.trim() || undefined })).filter((c) => c.name && c.phone);
    if (cleaned.length > 5) { setError('Maximum 5 contacts allowed'); return; }
    setLoading(true);
    try {
      await sosService.setContacts(cleaned);
      setSuccess('Emergency contacts updated');
    } catch (err) { setError(getApiError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-5 pb-6 max-w-lg mx-auto animate-blur-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-headline-md font-bold text-on-surface">Emergency Contacts</h2>
      </div>

      <div className="space-y-3">
        {contacts.map((contact, index) => (
          <div key={`contact-${index}`} className="glass-panel rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium text-on-surface">Contact {index + 1}</div>
              {contacts.length > 1 && (
                <button onClick={() => setContacts((p) => p.filter((_, i) => i !== index))} className="text-error hover:text-red-300 transition">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              )}
            </div>
            <input value={contact.name} onChange={(e) => updateContact(index, { name: e.target.value })} placeholder="Name"
              className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            <input value={contact.phone} onChange={(e) => updateContact(index, { phone: e.target.value })} placeholder="Phone"
              className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            <input value={contact.email ?? ''} onChange={(e) => updateContact(index, { email: e.target.value })} placeholder="Email (optional)"
              className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
          </div>
        ))}
      </div>

      {contacts.length < 5 && (
        <button onClick={() => setContacts((p) => [...p, emptyContact()])} className="flex items-center gap-2 text-primary text-sm font-medium">
          <span className="material-symbols-outlined text-[16px]">add</span> Add Contact
        </button>
      )}

      {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">{error}</div>}
      {success && <div className="bg-tertiary/10 border border-tertiary/20 rounded-lg px-4 py-3 text-tertiary text-sm">{success}</div>}

      <button onClick={save} disabled={loading} className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-3 rounded-xl">
        {loading ? 'Saving…' : 'Save Contacts'}
      </button>
    </div>
  );
}
