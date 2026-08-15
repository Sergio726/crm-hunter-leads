import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// En móvil el campo es más alto y con letra de 16px; recién desde `sm` toma la
// medida compacta de escritorio. Los dos detalles son a propósito:
// - 44px de alto es el objetivo táctil mínimo recomendado (36px se falla seguido).
// - Con menos de 16px, Safari en iOS hace zoom solo al enfocar el campo: la
//   página salta, el input se va de pantalla y parece que no se pudiera escribir.
const BASE =
  'h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 sm:h-9 sm:text-sm';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(BASE, 'cursor-pointer', className)} {...props} />;
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('mb-1 block text-xs font-medium text-muted-foreground', className)}>
      {children}
    </label>
  );
}
