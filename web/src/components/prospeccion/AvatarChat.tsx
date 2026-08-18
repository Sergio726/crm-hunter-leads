'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { TurboFace, TurboPortrait } from '@/components/brand/TurboAvatar';
import type { ChatTurn } from '@/lib/prospect/types';
import { ChatMarkdown } from './ChatMarkdown';

const SUGGESTIONS = [
  'Hago páginas web para inmobiliarias',
  'Doy mentorías de liderazgo a gerentes',
  'Vendo insumos a clínicas de estética',
];

/** Respuestas que propone Turbo: viven bajo SU mensaje, no como chips del usuario. */
const QUICK_REPLY =
  'rounded-lg border border-border bg-background px-3 py-1.5 text-left text-xs text-foreground ' +
  'transition-colors hover:bg-muted disabled:opacity-50';

function horaDe(at?: number): string {
  if (!at) return '';
  return new Date(at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Conversación con Turbo.
 *
 * No es un clon de WhatsApp: es un copiloto. Turbo habla a la izquierda, sin
 * burbuja; el vendedor a la derecha, en una superficie neutra. El retrato 3D
 * aparece en el encabezado y en el primer mensaje de cada grupo — nunca el SVG
 * chico, que a 20px se leía como una carita genérica.
 *
 * Lo que sí se conserva de una mensajería: Enter envía, Shift+Enter baja de
 * línea, los mensajes seguidos se agrupan, y tocar una sugerencia la manda
 * como si la hubiera escrito el vendedor (así ningún toque gasta plata solo).
 */
export function AvatarChat({
  turns,
  draft,
  thinking,
  options,
  onDraftChange,
  onSend,
}: {
  turns: ChatTurn[];
  draft: string;
  thinking: boolean;
  /** Respuestas sugeridas por Turbo en su último mensaje. */
  options?: string[] | null;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, thinking, options]);

  function submit(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || thinking) return;
    onSend(value);
  }

  return (
    <div className="flex h-[28rem] flex-col sm:h-[34rem]">
      <div className="mb-3 flex items-center gap-3">
        <TurboFace size={40} alt="" />
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold tracking-tight text-foreground">Turbo</p>
          <p className="text-xs text-muted-foreground">
            {thinking ? 'Está pensando…' : 'Copiloto de prospección'}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        {turns.length === 0 && (
          <div className="flex flex-col items-center px-2 py-6 text-center text-sm text-muted-foreground">
            <TurboPortrait size={88} />
            <p className="mt-4 font-medium text-foreground">Contame qué vendés y a quién</p>
            <p className="mt-1 max-w-sm">
              No hace falta que sepas el rubro ni la zona todavía. Arrancá por lo que ofrecés y
              lo armamos juntos.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => onSend(s)} className={QUICK_REPLY}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => {
          const mio = turn.role === 'user';
          const primero = i === 0 || turns[i - 1].role !== turn.role;
          const ultimoDelGrupo = i === turns.length - 1 || turns[i + 1].role !== turn.role;

          if (mio) {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-muted px-3.5 py-2 text-sm text-foreground">
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                  {turn.at && ultimoDelGrupo && (
                    <p className="mt-1 text-right text-[0.625rem] text-muted-foreground">
                      {horaDe(turn.at)}
                    </p>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-9 shrink-0">{primero ? <TurboFace size={36} alt="Turbo" /> : null}</div>
              <div className="min-w-0 max-w-[85%] space-y-1 pt-0.5 text-sm leading-relaxed text-foreground">
                <ChatMarkdown text={turn.content} />
                {turn.at && ultimoDelGrupo && (
                  <p className="mt-1 text-[0.625rem] text-muted-foreground">{horaDe(turn.at)}</p>
                )}
              </div>
            </div>
          );
        })}

        {!thinking && options && options.length > 0 && (
          <div className="flex items-start gap-2.5">
            <div className="w-9 shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o} type="button" onClick={() => onSend(o)} className={QUICK_REPLY}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {thinking && (
          <div
            className="flex items-center gap-2.5 text-sm text-muted-foreground"
            aria-live="polite"
            aria-label="Turbo está pensando"
          >
            {turns.at(-1)?.role === 'assistant' ? (
              <div className="w-9 shrink-0" />
            ) : (
              <TurboFace size={36} alt="" />
            )}
            <span>Está pensando…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          placeholder="Contame qué vendés y a quién"
          disabled={thinking}
          aria-label="Mensaje para Turbo"
          className="rounded-xl"
        />
        <Button
          type="submit"
          disabled={thinking || draft.trim().length === 0}
          aria-label="Enviar"
          className="h-11 w-11 shrink-0 rounded-xl p-0 sm:h-9 sm:w-9"
        >
          {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
