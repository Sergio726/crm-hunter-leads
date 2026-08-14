'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ChatTurn } from '@/lib/prospect/types';

const SUGGESTIONS = [
  'Inmobiliarias chicas sin web en CABA',
  'Clínicas de estética en Montevideo con Instagram',
  'Restaurantes de barrio en Córdoba',
];

export function AvatarChat({
  turns,
  draft,
  thinking,
  onDraftChange,
  onSend,
}: {
  turns: ChatTurn[];
  draft: string;
  thinking: boolean;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, thinking]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || thinking) return;
    onSend(value);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-64 flex-1 space-y-3 overflow-y-auto pr-1">
        {turns.length === 0 && (
          <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="h-4 w-4" /> Contame a quién querés venderle
            </p>
            <p className="mt-1">
              Describí el cliente ideal en una frase: rubro, zona y lo que te importe. Te propongo
              los filtros y los podés ajustar antes de buscar.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSend(s)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div
            key={i}
            className={`max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              turn.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            }`}
          >
            {turn.content}
          </div>
        ))}

        {thinking && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando el avatar…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Ej.: inmobiliarias sin web en Palermo"
          disabled={thinking}
          aria-label="Mensaje para el asistente"
        />
        <Button type="submit" disabled={thinking || draft.trim().length === 0} aria-label="Enviar">
          {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
