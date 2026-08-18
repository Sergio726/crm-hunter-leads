'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { TurboMark, TurboPortrait } from '@/components/brand/TurboAvatar';
import type { ChatTurn } from '@/lib/prospect/types';
import { ChatMarkdown } from './ChatMarkdown';

// Arranques que describen una OFERTA y no un rubro: Turbo empieza por qué vende
// el usuario, así que las sugerencias tienen que empujar hacia ahí.
const SUGGESTIONS = [
  'Hago páginas web para inmobiliarias',
  'Doy mentorías de liderazgo a gerentes',
  'Vendo insumos a clínicas de estética',
];

/** Respuestas rápidas: se tocan y se envían, como en una app de mensajería. */
const QUICK_REPLY =
  'rounded-full border border-primary/40 bg-card px-3 py-2 text-xs font-medium text-primary-deep ' +
  'transition-colors hover:bg-primary/10 disabled:opacity-50 sm:py-1.5';

function horaDe(at?: number): string {
  if (!at) return '';
  return new Date(at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Chat con Turbo, el agente de IA de ST Labs.
 *
 * El manual pide que la IA sea reconocible y explicable: Turbo se presenta con
 * nombre y avatar, y cada mensaje suyo lleva su marca al lado, para que nunca se
 * confunda quién habla.
 *
 * La forma es la de una app de mensajería —burbujas con cola, hora al pie,
 * mensajes propios a la derecha— porque es la convención que todo el mundo ya
 * sabe leer. Es un desvío deliberado del lenguaje "terminal" del manual, pedido
 * por el usuario: acá la familiaridad vale más que la coherencia estética, y la
 * paleta sigue siendo la de la marca.
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
    // Altura acotada y no `h-full`: el padre no define altura, así que `h-full`
    // se resolvía como `auto` y el historial crecía sin techo. En un teléfono eso
    // empujaba el campo de escritura fuera de la pantalla y daba la sensación de
    // que el chat no dejaba escribir.
    <div className="flex h-[26rem] flex-col sm:h-[30rem]">
      {/* Encabezado: quién es y en qué estado está. */}
      <div className="mb-2 flex items-center gap-2.5 border-b border-border pb-2.5">
        <TurboMark size="md" glow />
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold tracking-tight text-foreground">Turbo</p>
          <p className="eyebrow text-muted-foreground">{thinking ? '/ escribiendo…' : '/ listo'}</p>
        </div>
      </div>

      {/* El lienzo de la conversación, apenas separado del resto de la tarjeta. */}
      <div className="-mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain rounded-lg bg-muted/20 px-2 py-2">
        {turns.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            <div className="flex flex-col items-center text-center">
              <TurboPortrait size={72} />
              <p className="mt-3 font-medium text-foreground">Contame qué vendés y a quién</p>
              <p className="mt-1">
                No hace falta que sepas el rubro ni la zona todavía. Arrancá por lo que ofrecés y
                lo armamos juntos.
              </p>
            </div>
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
          // Mensajes seguidos del mismo lado se agrupan: solo el primero lleva
          // la marca de Turbo y la cola de la burbuja, como en cualquier
          // mensajería. Sin esto, una respuesta larga partida en dos parece dos
          // interlocutores distintos.
          const primero = i === 0 || turns[i - 1].role !== turn.role;

          return (
            <div key={i} className={`flex items-end gap-1.5 ${mio ? 'justify-end' : ''}`}>
              {!mio && (
                <div className="w-5 shrink-0">{primero && <TurboMark size="sm" />}</div>
              )}
              <div
                className={`max-w-[85%] px-3 py-2 text-sm break-words shadow-sm ${
                  mio
                    ? // Superficie sutil y no el mint pleno: un mensaje es contenido
                      // de lectura, no una acción. Con el fondo lleno la burbuja
                      // tenía casi 300 veces la luminancia del fondo (ver D24).
                      `rounded-2xl border border-primary/25 bg-[var(--badge-primary-bg)] text-foreground ${
                        primero ? 'rounded-br-sm' : ''
                      }`
                    : `rounded-2xl bg-card text-foreground ${primero ? 'rounded-bl-sm' : ''}`
                }`}
              >
                <div className="space-y-0.5 [&_p]:leading-snug">
                  {mio ? (
                    // Lo que escribe el vendedor se muestra tal cual: si tipeó
                    // asteriscos, quiso poner asteriscos.
                    <p className="whitespace-pre-wrap">{turn.content}</p>
                  ) : (
                    <ChatMarkdown text={turn.content} />
                  )}
                </div>
                {turn.at && (
                  <p className="mt-0.5 text-right text-[0.625rem] leading-none text-muted-foreground">
                    {horaDe(turn.at)}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Opciones que propuso Turbo. Al tocarlas se envía ese texto como si lo
            hubiera escrito el vendedor: no ejecutan nada por su cuenta, así
            ningún toque gasta plata sin querer. */}
        {!thinking && options && options.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5 pt-1">
            {options.map((o) => (
              <button key={o} type="button" onClick={() => onSend(o)} className={QUICK_REPLY}>
                {o}
              </button>
            ))}
          </div>
        )}

        {thinking && (
          <div className="flex items-end gap-1.5">
            <div className="w-5 shrink-0">
              <TurboMark size="sm" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-card px-3 py-2 shadow-sm">
              {/* Tres puntitos, como cualquier mensajería. */}
              <span className="flex items-center gap-1" aria-label="Turbo está escribiendo">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* `items-end`: el campo crece hacia arriba, el botón sigue a la última línea. */}
      <form onSubmit={submit} className="mt-2 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter envía; Shift+Enter hace salto de línea, como en WhatsApp Web.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          placeholder="Contame qué vendés y a quién"
          disabled={thinking}
          aria-label="Mensaje para Turbo"
          className="rounded-2xl"
        />
        <Button
          type="submit"
          disabled={thinking || draft.trim().length === 0}
          aria-label="Enviar"
          className="h-11 w-11 shrink-0 rounded-full p-0 sm:h-9 sm:w-9"
        >
          {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
