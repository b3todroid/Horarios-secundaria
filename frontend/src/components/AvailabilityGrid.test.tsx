import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Period } from '../api/types';
import type { Grid } from '../lib/availability';
import { AvailabilityGrid, Legend, type Brush } from './AvailabilityGrid';

const periods: Period[] = [
  { number: 1, start_time: '07:30', end_time: '08:20', active: true },
  { number: 2, start_time: '08:20', end_time: '09:10', active: true },
];

function Harness({ brush = 'cycle' as Brush, selecting = false, onGrid }: { brush?: Brush; selecting?: boolean; onGrid?: (g: Grid) => void }) {
  const [grid, setGrid] = useState<Grid>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  return (
    <AvailabilityGrid
      periods={periods}
      grid={grid}
      onChange={(g) => {
        setGrid(g);
        onGrid?.(g);
      }}
      brush={brush}
      selecting={selecting}
      selected={sel}
      onSelectedChange={setSel}
    />
  );
}

describe('AvailabilityGrid', () => {
  it('cambia entre los tres estados al tocar una celda', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const cell = () => screen.getByRole('button', { name: /Lunes, hora 1 .*:/ });
    expect(cell()).toHaveAccessibleName(/Disponible/);
    await user.click(cell());
    expect(cell()).toHaveAccessibleName(/Flexible/);
    await user.click(cell());
    expect(cell()).toHaveAccessibleName(/Bloqueada/);
    await user.click(cell());
    expect(cell()).toHaveAccessibleName(/Disponible/);
  });

  it('marca un día completo con el pincel elegido', async () => {
    let last: Grid = {};
    render(<Harness brush="blocked" onGrid={(g) => (last = g)} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Miércoles.*aplicar a todo el día/ }));
    expect(last).toEqual({ '2-1': 'blocked', '2-2': 'blocked' });
  });

  it('marca una hora completa', async () => {
    let last: Grid = {};
    render(<Harness brush="flexible" onGrid={(g) => (last = g)} />);
    await userEvent.setup().click(screen.getAllByRole('button', { name: /aplicar a esta hora/ })[1]);
    expect(Object.keys(last)).toHaveLength(5);
    expect(Object.values(last).every((s) => s === 'flexible')).toBe(true);
  });

  it('permite seleccionar varias celdas', async () => {
    render(<Harness selecting />);
    const user = userEvent.setup();
    const a = screen.getByRole('button', { name: /Lunes, hora 1 .*:/ });
    const b = screen.getByRole('button', { name: /Martes, hora 2 .*:/ });
    await user.click(a);
    await user.click(b);
    expect(a).toHaveAttribute('aria-pressed', 'true');
    expect(b).toHaveAttribute('aria-pressed', 'true');
  });

  it('se navega con las flechas del teclado', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    screen.getByRole('button', { name: /Lunes, hora 1 .*:/ }).focus();
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(document.activeElement).toHaveAccessibleName(/Martes, hora 2/);
  });

  it('la leyenda usa texto e iconos además del color', () => {
    render(<Legend />);
    const legend = screen.getByRole('list', { name: /Leyenda/ });
    expect(legend).toHaveTextContent('Disponible');
    expect(legend).toHaveTextContent('Flexible');
    expect(legend).toHaveTextContent('Bloqueada');
    expect(legend).toHaveTextContent('✓');
    expect(legend).toHaveTextContent('✕');
  });
});
