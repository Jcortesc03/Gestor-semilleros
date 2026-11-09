import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PeopleRankings, rankPeople } from '../../../src/features/analytics/RankingTables';

const person = (name: string, activities: number, completionRate: number | null, meetingsOrganized: number) => ({ name, activities, completionRate, meetingsOrganized });

describe('rankPeople', () => {
  it('excluye a quien tiene menos de 5 actividades del ranking de finalización', () => {
    const { completion } = rankPeople([person('Uno de uno', 1, 1, 0), person('Constante', 20, 0.8, 0), person('Sin datos', 0, null, 0)]);
    expect(completion.map((p) => p.name)).toEqual(['Constante']);
  });

  it('ordena y limita a 10 por cada métrica', () => {
    const people = Array.from({ length: 30 }, (_, i) => person(`Tutor ${String(i).padStart(2, '0')}`, 10, i / 30, i));
    const { completion, meetings } = rankPeople(people);
    expect(completion).toHaveLength(10);
    expect(completion[0].name).toBe('Tutor 29');
    expect(meetings.map((p) => p.meetingsOrganized)).toEqual([29, 28, 27, 26, 25, 24, 23, 22, 21, 20]);
  });
});

describe('PeopleRankings', () => {
  it('muestra los dos rankings con su unidad', () => {
    render(<PeopleRankings people={[person('Ana Pérez', 12, 0.75, 4)]} noun="tutor" />);
    expect(screen.getByRole('img', { name: 'tutores con mayor tasa de finalización' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'tutores con más reuniones organizadas' })).toBeInTheDocument();
  });

  it('explica cuando nadie alcanza el mínimo', () => {
    render(<PeopleRankings people={[person('Ana Pérez', 2, 1, 0)]} noun="decano" />);
    expect(screen.getByText(/Ningún decano tiene al menos 5 actividades/)).toBeInTheDocument();
    expect(screen.getByText(/Ningún decano organizó reuniones/)).toBeInTheDocument();
  });
});

describe('TutorsTable paginada', () => {
  it('muestra 10 filas por página y avanza', async () => {
    const { TutorsTable } = await import('../../../src/features/analytics/RankingTables');
    const { default: userEvent } = await import('@testing-library/user-event');
    const tutors = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`, name: `Tutor ${String(i).padStart(2, '0')}`, projects: 1, boards: 1, activities: 10, done: i % 10,
      completionRate: (i % 10) / 10, onTimeRate: null, approvalRate: null, meetingsOrganized: i, meetingsAttended: 0,
    }));
    render(<TutorsTable tutors={tutors} />);
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('1–10 de 25 · página 1 de 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('11–20 de 25 · página 2 de 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ordenar por tutor' }));
    expect(screen.getByText('1–10 de 25 · página 1 de 3')).toBeInTheDocument();
  });
});
