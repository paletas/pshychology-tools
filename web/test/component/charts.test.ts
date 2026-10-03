import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chartPayloads } from '../../src/engine/charts';
import { scoreCase } from '../../src/engine/scoring';
import { parseBundle } from '../../src/refdata/schema';
import { pt } from '../../src/i18n/pt';
import { qiConfig } from '../../src/ui/Charts';
import { birthFor } from '../shared/load';

const data = parseBundle(readFileSync(resolve(__dirname, '../../public/reference/baseline.json'), 'utf8'));
const TEST_DATE = '2026-10-03';

describe('QI chart payload', () => {
  it('keeps an unavailable index as a null slot (3 QI + 3 indices, 6 slots per dataset)', () => {
    const age: [number, number, number] = [9, 3, 12];
    const probe = scoreCase(data, { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw: {} });
    const raw: Record<string, number> = {};
    for (const [id, t] of Object.entries(probe.tests)) raw[id] = Math.floor((t.min! + t.max!) / 2);
    const snap = scoreCase(data, { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw });
    expect(snap.indicesShown).toBe(true);
    // force one index unavailable, as the engine does for a sum outside the key set
    snap.indices.processingVelocity = { ...snap.indices.processingVelocity!, entry: 'unavailable' };
    const payload = chartPayloads(snap, pt)!;
    expect(payload.qi.QI).toHaveLength(3);
    expect(payload.qi.Indices).toHaveLength(3);
    expect(payload.qi.Indices[2].median).toBeNull();
    const cfg = qiConfig(payload.qi);
    expect(cfg.data.labels).toHaveLength(6);
    const mins = [...payload.qi.QI, ...payload.qi.Indices].map((e) => e.min).filter((v): v is number => v !== null);
    expect(cfg.options.scales.y.min).toBe(Math.floor(Math.min(...mins) / 5) * 5);
    expect(cfg.options.scales.y.beginAtZero).toBe(false);
    for (const ds of cfg.data.datasets) expect(ds.data).toHaveLength(6);
    expect(cfg.data.datasets[1].data[5]).toBeNull();
    expect(cfg.data.datasets[1].data[3]).not.toBeNull();
  });
});
