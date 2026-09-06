'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Field';
import type { Profile } from '@/lib/types';

const ROLE_LABELS: Record<Profile['role'], string> = {
  pending: 'Pendiente',
  seller: 'Vendedor',
  superadmin: 'Administrador',
  viewer: 'Lector',
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [secondaryEmail, setSecondaryEmail] = useState(profile.secondary_email ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        secondary_email: secondaryEmail.trim() || null,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (error) return toast.error('Error al guardar: ' + error.message);
    toast.success('Perfil actualizado');
    router.refresh();
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${profile.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, cacheControl: '3600' });
    if (uploadError) {
      setUploadingAvatar(false);
      return toast.error('No se pudo subir la foto: ' + uploadError.message);
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Cache-bust: mismo path, la URL pública no cambia entre subidas.
    const bustedUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: bustedUrl })
      .eq('id', profile.id);
    setUploadingAvatar(false);
    if (updateError) return toast.error('No se pudo guardar la foto: ' + updateError.message);
    setAvatarUrl(bustedUrl);
    toast.success('Foto actualizada');
    router.refresh();
  }

  const initial = (fullName || profile.email).trim()[0]?.toUpperCase() ?? 'U';

  return (
    <div className="max-w-xl space-y-6">
      <SectionCard title="Foto de perfil">
        <div className="flex items-center gap-4">
          <div className="relative">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-semibold text-foreground">
                {initial}
              </span>
            )}
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={uploadingAvatar}
              onClick={() => fileInput.current?.click()}
            >
              <Camera className="h-4 w-4" />
              {uploadingAvatar ? 'Subiendo…' : 'Cambiar foto'}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAvatar(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Datos" description={`${ROLE_LABELS[profile.role]} · ${profile.email}`}>
        <div className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+549..." />
          </div>
          <div>
            <Label>Email secundario</Label>
            <Input
              type="email"
              value={secondaryEmail}
              onChange={(e) => setSecondaryEmail(e.target.value)}
              placeholder="opcional"
            />
          </div>
        </div>
        <Button className="mt-4" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </SectionCard>
    </div>
  );
}
