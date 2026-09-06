'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useResetWhen } from '@/lib/use-reset-when';
import { ChevronDown } from 'lucide-react';
import { Input, Label } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

export type ComboboxOption = { value: string; label: string };

type ComboboxProps = {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder = 'Escribí para buscar…',
  emptyLabel = 'Sin coincidencias',
  disabled = false,
  className,
}: ComboboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  // Solo filtrar por lo que el usuario tipeó DESPUÉS de abrir: si filtráramos por
  // el texto de la selección actual, al abrir se vería una sola opción.
  const [typed, setTyped] = useState(false);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  // El texto del campo sigue a la selección de afuera. Antes era un efecto, que
  // repintaba dos veces por cada cambio de valor.
  useResetWhen(`${value}|${selectedLabel}`, () => setQuery(selectedLabel));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !typed) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query, typed]);

  // Al cambiar lo tipeado o al abrir, la opción resaltada vuelve a la primera.
  useResetWhen(`${query}|${open}`, () => setHighlight(0));

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function select(option: ComboboxOption) {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
    setTyped(false);
  }

  function onBlur() {
    const exact = options.find((o) => o.label.toLowerCase() === query.trim().toLowerCase());
    if (exact) select(exact);
    else setQuery(selectedLabel);
    setTyped(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlight]) select(filtered[highlight]);
      else {
        const exact = options.find((o) => o.label.toLowerCase() === query.trim().toLowerCase());
        if (exact) select(exact);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(selectedLabel);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && <Label>{label}</Label>}
      <div className={cn('relative', label && 'mt-1')}>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTyped(true);
            setOpen(true);
          }}
          onFocus={(e) => {
            setTyped(false);
            setOpen(true);
            e.target.select();
          }}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-9"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {open && !disabled && (
        <ul
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === o.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(o)}
                  className={cn(
                    'flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                    highlight === i && 'bg-muted',
                    value === o.value && 'font-medium text-primary-deep',
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
