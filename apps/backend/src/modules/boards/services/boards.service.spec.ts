import { completionChange } from './boards.service';

describe('completionChange (ADR 0016)', () => {
  it('fija la fecha al pasar a DONE desde otro estado', () => {
    for (const current of ['PENDING', 'IN_PROGRESS', 'CANCELLED'] as const) {
      expect(completionChange(current, 'DONE')).toBeInstanceOf(Date);
    }
  });

  it('no la toca si ya estaba en DONE', () => {
    expect(completionChange('DONE', 'DONE')).toBeUndefined();
  });

  it('la borra al salir de DONE', () => {
    for (const next of ['PENDING', 'IN_PROGRESS', 'CANCELLED'] as const) {
      expect(completionChange('DONE', next)).toBeNull();
    }
  });

  it('no la toca entre estados no terminados', () => {
    expect(completionChange('PENDING', 'IN_PROGRESS')).toBeUndefined();
  });
});
