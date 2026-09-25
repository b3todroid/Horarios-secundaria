import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Period, RecognitionResult, RecognizedTeacher } from '../api/types';
import { ImportReview, reviewErrors } from './ImportReview';

const periods: Period[] = [1, 2, 3].map((n) => ({ number: n, start_time: `0${6 + n}:00`, end_time: `0${6 + n}:50`, active: true }));

const result: RecognitionResult = {
  provider: 'demo',
  provider_label: 'Demostración local (sin IA)',
  pages: 1,
  overall_confidence: 0.76,
  warnings: [],
  teachers: [
    {
      code: 'M90',
      name: 'María Salas',
      subjects: ['Geografía'],
      assignments: [
        { subject: 'Geografía', group: '1A', hours: 4 },
        { subject: 'Geografía', group: '1B', hours: 4 },
      ],
      weekly_load: 10,
      allows_consecutive: true,
      max_consecutive: 2,
      availability: [{ day: 0, period_number: 1, state: 'blocked' }],
      confidence: { name: 0.95, subjects: 0.9, assignments: 0.6, weekly_load: 0.5, max_consecutive: 0.8, availability: 0.75 },
      warnings: ['La suma de horas por grupo (8) no coincide con la carga semanal (10).'],
    },
  ],
};

describe('Pantalla de revisión de fotografía', () => {
  it('muestra la imagen original junto a los datos reconocidos', () => {
    render(<ImportReview result={result} images={['blob:foto']} periods={periods} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('img', { name: /Página 1/ })).toHaveAttribute('src', 'blob:foto');
    expect(screen.getByLabelText(/Nombre del maestro/)).toHaveValue('María Salas');
    expect(screen.getByLabelText(/Horas semanales/)).toHaveValue(10);
    expect(screen.getByLabelText(/Máximo de horas consecutivas/)).toHaveValue(2);
    expect(screen.getByLabelText(/Materias/)).toHaveValue('Geografía');
    expect(screen.getByLabelText('Grupo de la fila 2')).toHaveValue('1B');
    expect(screen.getByText(/no coincide con la carga semanal/)).toBeInTheDocument();
    expect(screen.getByText(/Nada se guarda hasta que pulses/)).toBeInTheDocument();
  });

  it('señala los datos dudosos y el nivel de confianza', () => {
    render(<ImportReview result={result} images={[]} periods={periods} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByText('! Revisar').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/de confianza en las horas semanales, dato dudoso/)).toBeInTheDocument();
    expect(screen.getByText('95%', { exact: false })).toBeInTheDocument();
  });

  it('muestra la disponibilidad reconocida en la cuadrícula', () => {
    render(<ImportReview result={result} images={[]} periods={periods} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Lunes, hora 1 .*Bloqueada/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Martes, hora 1 .*Disponible/ })).toBeInTheDocument();
  });

  it('permite corregir todo antes de confirmar e importar', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ImportReview result={result} images={[]} periods={periods} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const name = screen.getByLabelText(/Nombre del maestro/);
    await user.clear(name);
    await user.type(name, 'María Fernanda Salas');
    const hours = screen.getByLabelText(/Horas semanales/);
    await user.clear(hours);
    await user.type(hours, '8');
    await user.click(screen.getByRole('button', { name: /Martes, hora 2/ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar e importar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [sent] = onConfirm.mock.calls[0] as [RecognizedTeacher[]];
    expect(sent[0].name).toBe('María Fernanda Salas');
    expect(sent[0].weekly_load).toBe(8);
    expect(sent[0].availability).toContainEqual({ day: 1, period_number: 2, state: 'flexible' });
  });

  it('no permite confirmar con datos incompletos', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ImportReview result={result} images={[]} periods={periods} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await user.clear(screen.getByLabelText(/Nombre del maestro/));
    await user.clear(screen.getByLabelText('Grupo de la fila 1'));
    await user.click(screen.getByRole('button', { name: 'Confirmar e importar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/Falta el nombre/)).toBeInTheDocument();
    expect(alert).toHaveTextContent('fila 1');
  });

  it('permite captura manual cuando no hay reconocimiento', async () => {
    const onConfirm = vi.fn();
    render(
      <ImportReview result={{ ...result, teachers: [] }} images={[]} periods={periods} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    expect(screen.getByLabelText(/Nombre del maestro/)).toHaveValue('');
    expect(reviewErrors({ ...result.teachers[0], name: '' })).toContain('Falta el nombre.');
  });
});
