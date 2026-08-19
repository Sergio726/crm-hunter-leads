'use client';

import { Input, Label, Select } from '@/components/ui/Field';
import { NICHE_PACKS } from '@/lib/prospect/niches';
import {
  COUNTRIES,
  MAX_LIMIT,
  MIN_LIMIT,
  clampLimit,
  type CountryCode,
  type ProspectFilters,
} from '@/lib/prospect/types';

/** Convierte una lista a texto editable (una entrada por línea) y viceversa. */
function toLines(values: string[]): string {
  return values.join('\n');
}
function fromLines(value: string): string[] {
  return value
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Los filtros, para el que quiera editarlos a mano.
 *
 * **Cada fuente muestra los suyos.** Antes se mostraban los de Google Maps
 * siempre, y buscando personas en LinkedIn aparecían "sin web propia", "rating
 * mínimo" y "requiere WhatsApp" — perillas que en LinkedIn no existen y que
 * nunca descartaron un solo perfil. Además de no servir, confundían: cuando una
 * búsqueda de LinkedIn daba cero, lo primero que uno mira son esas casillas, y
 * no eran la causa (el cero venía del propio LinkedIn, ver `linkedin.ts`).
 */
export function FiltersPanel({
  filters,
  onChange,
  disabled,
}: {
  filters: ProspectFilters;
  onChange: (next: ProspectFilters) => void;
  disabled: boolean;
}) {
  function set<K extends keyof ProspectFilters>(key: K, value: ProspectFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  // Rating, "sin web propia" y las señales de la ficha son cosas de Google Maps.
  const esGoogle = filters.source === 'google_places';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Los packs de rubro son de Google Maps: agrupan términos de comercio
            local ("inmobiliaria", "corredor inmobiliario"). En LinkedIn no se
            busca un rubro, se busca un cargo. */}
        {esGoogle && (
        <div>
          <Label>Rubro</Label>
          <Select
            value={filters.niche}
            disabled={disabled}
            onChange={(e) => {
              const pack = NICHE_PACKS.find((p) => p.id === e.target.value);
              onChange({
                ...filters,
                niche: e.target.value,
                // Al cambiar de pack se traen sus términos, salvo que el usuario
                // ya haya escrito los suyos a mano.
                queries: pack && filters.queries.length === 0 ? pack.queries : filters.queries,
              });
            }}
          >
            {NICHE_PACKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        )}
        {/* En LinkedIn e Instagram no hay packs de rubro, pero el rubro igual
            hace falta: es la etiqueta con la que nace el cliente al guardarlo, y
            lo que después permite separar inmobiliarias de gimnasios en la
            pantalla de Clientes. Antes se perdía y todos llegaban como
            "generico". */}
        {!esGoogle && (
          <div>
            <Label>Rubro</Label>
            <Input
              value={filters.niche === 'generico' ? '' : filters.niche}
              disabled={disabled}
              placeholder="gimnasios, inmobiliarias, dueños de pyme…"
              // Se acepta crudo mientras se tipea y se acomoda al salir del
              // campo, igual que "Máx. resultados". Recortar en cada tecla
              // impedía escribir un espacio: "dueños de pyme" quedaba
              // "dueñosdepyme". Verificado escribiéndolo en el navegador.
              onChange={(e) => set('niche', e.target.value)}
              onBlur={(e) => set('niche', e.target.value.trim() || 'generico')}
            />
          </div>
        )}
        <div>
          <Label>País</Label>
          <Select
            value={filters.country}
            disabled={disabled}
            onChange={(e) => set('country', e.target.value as CountryCode)}
          >
            {(Object.keys(COUNTRIES) as CountryCode[]).map((code) => (
              <option key={code} value={code}>
                {COUNTRIES[code].name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label>Zonas (una por línea)</Label>
        <textarea
          value={toLines(filters.areas)}
          disabled={disabled}
          onChange={(e) => set('areas', fromLines(e.target.value))}
          rows={3}
          placeholder={'Palermo, Buenos Aires\nRecoleta, Buenos Aires'}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 sm:text-sm"
        />
      </div>

      <div>
        {/* En Google se busca un rubro ("inmobiliaria"); en LinkedIn, el cargo
            que la persona tiene puesto en su perfil. Es el mismo campo pero no
            es lo mismo, y llamarlo igual en los dos lados hacía escribir rubros
            donde iban cargos. */}
        <Label>{esGoogle ? 'Términos de búsqueda (uno por línea)' : 'Cargos a buscar (uno por línea)'}</Label>
        <textarea
          value={toLines(filters.queries)}
          disabled={disabled}
          onChange={(e) => set('queries', fromLines(e.target.value))}
          rows={3}
          placeholder={esGoogle ? 'inmobiliaria\ncorredor inmobiliario' : 'fundador\nCEO\nsocio gerente'}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 sm:text-sm"
        />
        {!esGoogle && (
          <p className="mt-1 text-xs text-muted-foreground">
            LinkedIn compara el cargo <strong>palabra por palabra</strong> con lo que la persona
            escribió. Conviene poner varias formas de decir lo mismo: si con estas no aparece nadie,
            se reintenta solo buscándolas como texto.
          </p>
        )}
      </div>

      {esGoogle && (
      <fieldset className="space-y-2">
        <legend className="mb-1 block text-xs font-medium text-muted-foreground">Señales exigidas</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.requireNoWebsite}
            disabled={disabled}
            onChange={(e) => set('requireNoWebsite', e.target.checked)}
          />
          Sin web propia (Instagram o portal del rubro cuenta como sin web)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.requireWhatsapp}
            disabled={disabled}
            onChange={(e) => set('requireWhatsapp', e.target.checked)}
          />
          Teléfono celular (para contactar por WhatsApp)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.requireInstagram}
            disabled={disabled}
            onChange={(e) => set('requireInstagram', e.target.checked)}
          />
          Instagram en la ficha
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.requireLinkedin}
            disabled={disabled}
            onChange={(e) => set('requireLinkedin', e.target.checked)}
          />
          LinkedIn en la ficha
        </label>
      </fieldset>
      )}
      {esGoogle && filters.requireLinkedin && (
        // Aviso honesto: Google publica un solo enlace por negocio y casi nunca
        // es LinkedIn, así que esta señal recorta muchísimo. Sin este cartel, un
        // embudo vacío parece un error del sistema.
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Google muestra un solo enlace por negocio, y en un comercio local rara vez es LinkedIn:
          esta señal filtra mucho. Rinde en rubros B2B (consultoras, estudios, servicios
          profesionales).
        </p>
      )}

      {/* "Score mínimo" ya no existe: el puntaje ordena, no filtra. Era la
          perilla que más silenciosamente dejaba una búsqueda en cero, y ningún
          vendedor puede calibrar un número que significa cosas distintas según
          la fuente. Ver `ProspectFilters.minRating`. */}
      <div className="grid grid-cols-2 gap-3">
        {esGoogle && (
        <div>
          <Label>Rating mínimo</Label>
          <Input
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={filters.minRating ?? ''}
            placeholder="—"
            disabled={disabled}
            onChange={(e) => set('minRating', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        )}
        <div>
          <Label>Máx. resultados</Label>
          <Input
            type="number"
            min={MIN_LIMIT}
            max={MAX_LIMIT}
            value={filters.limit}
            disabled={disabled}
            // El valor se acepta crudo mientras se tipea y recién se acomoda al
            // salir del campo: clampear en cada tecla impide escribir "12",
            // porque el "1" intermedio ya sería un valor válido y final.
            onChange={(e) => set('limit', Number(e.target.value))}
            onBlur={() => set('limit', clampLimit(filters.limit))}
          />
        </div>
      </div>
    </div>
  );
}
