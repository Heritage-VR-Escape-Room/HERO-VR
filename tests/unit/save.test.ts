import { describe, it, expect } from 'vitest';
import { createSaveService } from '../../src/logic/save';
import { memoryKV, type KV } from '../../src/logic/storage';

const data = {
  checkpointId: 'plaza',
  solvedPuzzles: ['a', 'b'],
  inventory: ['key'],
  firedBeats: ['intro'],
  disabledObjects: ['gate'],
};

describe('save', () => {
  it('round-trips lists', () => {
    const s = createSaveService(memoryKV());
    s.save(data);
    const d = s.load()!;
    expect(d.version).toBe(1);
    expect(d.checkpointId).toBe('plaza');
    expect(d.solvedPuzzles).toEqual(['a', 'b']);
    expect(d.inventory).toEqual(['key']);
    expect(d.firedBeats).toEqual(['intro']);
    expect(d.disabledObjects).toEqual(['gate']);
    expect(typeof d.savedAtUtc).toBe('string');
    expect(s.hasValidSave()).toBe(true);
    s.clear();
    expect(s.load()).toBeNull();
  });
  it('corrupt JSON -> load null, hasValidSave false', () => {
    const kv = memoryKV();
    kv.set('som.save.v1', '{nope');
    const s = createSaveService(kv);
    expect(s.load()).toBeNull();
    expect(s.hasValidSave()).toBe(false);
  });
  it('wrong version -> null', () => {
    const kv = memoryKV();
    kv.set('som.save.v1', JSON.stringify({ ...data, version: 2, savedAtUtc: 'x' }));
    expect(createSaveService(kv).load()).toBeNull();
  });
  it('missing field -> null', () => {
    const kv = memoryKV();
    const { inventory: _i, ...rest } = data;
    kv.set('som.save.v1', JSON.stringify({ ...rest, version: 1, savedAtUtc: 'x' }));
    expect(createSaveService(kv).load()).toBeNull();
  });
  it('wrong-typed field -> null', () => {
    const kv = memoryKV();
    kv.set('som.save.v1', JSON.stringify({ ...data, solvedPuzzles: [1], version: 1, savedAtUtc: 'x' }));
    expect(createSaveService(kv).load()).toBeNull();
  });
  it('throwing storage -> no throw, load null', () => {
    const boom = () => { throw new Error('denied'); };
    const kv: KV = { get: boom, set: boom, del: boom };
    const s = createSaveService(kv);
    expect(() => s.save(data)).not.toThrow();
    expect(s.load()).toBeNull();
    expect(s.hasValidSave()).toBe(false);
    expect(() => s.clear()).not.toThrow();
  });
});
