// Scoring 0–100 de un candidato. Función pura: mismas entradas, mismo puntaje.
//
// La idea es priorizar negocios VIVOS y con material usable: fotos (hay con qué
// trabajar), reseñas y rating (tracción real), Instagram (canal de contacto y
// señal de que se ocupan de su presencia) y actividad reciente (no está muerto).

import type { NichePack } from './niches';

export interface ScoreInput {
  photosCount: number;
  reviewsCount: number;
  rating: number | null;
  instagram: string | null;
  /** Descripciones relativas de las reseñas ("hace 2 semanas"), tal como las da Places. */
  reviewAges: string[];
}

export interface ScoreOutput {
  score: number;
  reasons: string[];
}

/** La API devuelve hasta 10 fotos; con 6 ya hay material de sobra. */
function photosPoints(count: number, max: number): number {
  return (max * Math.min(count, 6)) / 6;
}

/** Escala hasta 40 reseñas: más que eso no agrega señal. */
function reviewsPoints(count: number, max: number): number {
  return (max * Math.min(count, 40)) / 40;
}

/** Lineal entre 3.5 y 5.0; por debajo de 3.5 no suma. */
function ratingPoints(rating: number | null, max: number): number {
  if (!rating || rating < 3.5) return 0;
  return (max * (rating - 3.5)) / 1.5;
}

/** Proxy de "negocio vivo": reseñas recientes. */
function activityPoints(reviewAges: string[], max: number): number {
  if (reviewAges.length === 0) return 0;
  const recent = reviewAges.filter((age) =>
    ['hora', 'día', 'dia', 'semana', 'mes'].some((unit) => age.toLowerCase().includes(unit)),
  ).length;
  return (max * Math.min(recent, 3)) / 3;
}

export function scoreProspect(input: ScoreInput, pack: NichePack): ScoreOutput {
  const w = pack.weights;
  const reasons: string[] = [];

  const photos = photosPoints(input.photosCount, w.photos);
  const reviews = reviewsPoints(input.reviewsCount, w.reviews);
  const rating = ratingPoints(input.rating, w.rating);
  const instagram = input.instagram ? w.instagram : 0;
  const activity = activityPoints(input.reviewAges, w.activity);

  if (input.photosCount >= 6) reasons.push('Material visual abundante');
  else if (input.photosCount === 0) reasons.push('Sin fotos en la ficha');

  if (input.reviewsCount >= 40) reasons.push('Muchas reseñas');
  else if (input.reviewsCount === 0) reasons.push('Sin reseñas');

  if (input.rating && input.rating >= 4.5) reasons.push('Rating alto');
  else if (input.rating && input.rating < 3.5) reasons.push('Rating bajo');

  if (input.instagram) reasons.push('Instagram detectado');
  if (activity > 0) reasons.push('Reseñas recientes');

  const total = photos + reviews + rating + instagram + activity;
  return { score: Math.round(total), reasons };
}
