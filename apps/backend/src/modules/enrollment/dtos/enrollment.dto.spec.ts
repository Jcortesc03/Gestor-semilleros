import { parseListQuery } from './enrollment.dto';

describe('Enrollment pagination contract', () => {
  it('uses the same 20-row first-page size as the enrollment interface', () => {
    expect(parseListQuery({})).toMatchObject({ ok: true, value: { limit: 20, offset: 0 } });
  });
});
