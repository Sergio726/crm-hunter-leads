'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useResetWhen } from '@/lib/use-reset-when';
import { ChevronDown, Clock, Loader2 } from 'lucide-react';
import { Input, Label } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

const RECENT_TAGS_KEY = 'ghl-recent-tags';
const MAX_RECENT = 5;
const MAX_OPTIONS = 60;

type TagComboboxProps = {
  tags: string[];
  value: string;
  onChange: (tag: string) => void;
  loading?: boolean;
  searching?: boolean;
  disabled?: boolean;
};

function readRecentTags(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_TAGS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentTag(tag: string) {
  const recent = [tag, ...readRecentTags().filter((t) => t !== tag)].slice(0, MAX_RECENT);
  sessionStorage.setItem(RECENT_TAGS_KEY, JSON.stringify(recent));
}

export function TagCombobox({
  tags,
  value,
  onChange,
  loading = false,
  searching = false,
  disabled = false,
}: TagComboboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlight, setHighlight] = useState(0);
  const [recentTags, setRecentTags] = useState<string[]>([]);

  // El campo sigue al valor de afuera.
  useResetWhen(value, () => setQuery(value));
  // Las etiquetas recientes viven en el navegador; se releen al cambiar el
  // valor porque acaba de sumarse una.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRecentTags(readRecentTags()), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? tags.filter((t) => t.toLowerCase().includes(q)) : tags;
    return list.slice(0, MAX_OPTIONS);
  }, [tags, query]);

  const options = useMemo(() => {
    if (!open) return [];
    const q = query.trim();
    if (!q && recentTags.length > 0) {
      const recent = recentTags.filter((t) => tags.includes(t));
      const rest = filtered.filter((t) => !recent.includes(t));
      return [...recent, ...rest].slice(0, MAX_OPTIONS);
    }
    return filtered;
  }, [open, query, recentTags, tags, filtered]);

  useResetWhen(`${query}|${open}`, () => setHighlight(0));

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function select(tag: string) {
    onChange(tag);
    setQuery(tag);
    setOpen(false);
    saveRecentTag(tag);
    setRecentTags(readRecentTags());
  }

  function tryExactMatch(text: string) {
    const exact = tags.find((t) => t.toLowerCase() === text.trim().toLowerCase());
    if (exact) select(exact);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && options[highlight]) select(options[highlight]);
      else tryExactMatch(query);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(value);
    }
  }

  const showRecentHeader = open && !query.trim() && recentTags.some((t) => tags.includes(t));

  return (
    <div ref={containerRef} className="relative">
      <Label>Etiqueta GHL</Label>
      <div className="relative mt-1">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim() && value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            const exact = tags.find((t) => t.toLowerCase() === query.trim().toLowerCase());
            if (exact) select(exact);
            else setQuery(value);
          }}
          onKeyDown={onKeyDown}
          placeholder={loading ? 'Cargando tags…' : 'Escribí o elegí una tag…'}
          disabled={disabled || loading}
          className="pr-16"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {!loading && tags.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {filtered.length} de {tags.length} etiqueta(s)
          {value && searching ? ' · buscando contactos…' : ''}
        </p>
      )}

      {open && !loading && (
        <ul
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg"
          role="listbox"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No hay tags que coincidan</li>
          ) : (
            options.map((t, i) => {
              const isRecent = showRecentHeader && recentTags.includes(t) && i < recentTags.length;
              const showHeader = showRecentHeader && i === 0;
              const showDivider =
                showRecentHeader && i === recentTags.filter((r) => tags.includes(r)).length;

              return (
                <li key={t} role="presentation">
                  {showHeader && (
                    <p className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3 w-3" /> Recientes
                    </p>
                  )}
                  {showDivider && (
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Todas
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === t}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(t)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                      highlight === i && 'bg-muted',
                      value === t && 'font-medium text-primary-deep',
                    )}
                  >
                    {isRecent && <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{t}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
