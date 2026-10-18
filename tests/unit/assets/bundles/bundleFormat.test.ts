import { describe, it, expect } from 'vitest';
import { deflateSync, strToU8 } from 'fflate';

import {
  compareSegmentPrecedence, contentName, decodeIndexSegment, decodeShardHeader, encodeIndexSegment,
  encodeShard, mimeFromPath, parseMarker, shardHeaderSize, sniffImageMime,
} from '../../../../src/assets/bundles/bundleFormat';
import type { IndexSegment, SegmentPrecedence } from '../../../../src/assets/bundles/bundleFormat';
import { fakeImage } from './fakeVault';

describe('shard codec', () => {
  it('round-trips the entry table with absolute offsets', () => {
    const a = fakeImage('png', 40, 1);
    const b = fakeImage('webp', 25, 2);
    const { bytes, table } = encodeShard([
      { key: 'walls/a.png', bytes: a, mime: 'image/png' },
      { key: 'floors/ü.webp', bytes: b, mime: 'image/webp' },
    ]);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('WRSH');
    const header = decodeShardHeader(bytes);
    expect(header.major).toBe(1);
    expect(header.minor).toBe(0);
    expect(header.entries).toEqual(table);
    expect(header.entries[0].offset).toBe(shardHeaderSize(['walls/a.png', 'floors/ü.webp']));
    expect(bytes.subarray(table[1].offset, table[1].offset + table[1].length)).toEqual(b);
    expect(header.entries[1].mime).toBe('image/webp');
  });

  it('rejects bad magic and truncated tables', () => {
    expect(() => decodeShardHeader(strToU8('NOPE00000000'))).toThrow();
    const { bytes } = encodeShard([{ key: 'k.png', bytes: fakeImage('png', 10), mime: 'image/png' }]);
    expect(() => decodeShardHeader(bytes.subarray(0, 16))).toThrow();
  });
});

describe('index segment codec', () => {
  const seg: IndexSegment = {
    format: 'windrose-tiles', major: 1, minor: 0, packId: 'p', createdAt: '2026-01-01T00:00:00Z', mode: 'exact',
    shards: [{ name: '0123456789abcdef.wrshard', size: 100 }],
    entries: { 'a.png': { id: 'a', shard: 0, o: 20, l: 10, mime: 'image/png', w: 1, h: 2 } },
  };

  it('round-trips', () => {
    expect(decodeIndexSegment(encodeIndexSegment(seg))).toEqual({ ...seg, thumbShards: undefined });
  });

  it('rejects empty, wrong major and malformed entries', () => {
    expect(() => decodeIndexSegment(new Uint8Array(0))).toThrow();
    expect(() => decodeIndexSegment(encodeIndexSegment({ ...seg, major: 2 as 1 }))).toThrow();
    const bad = deflateSync(strToU8(JSON.stringify({ ...seg, entries: { 'a.png': { id: 'a', shard: '0', o: 1, l: 1 } } })));
    expect(() => decodeIndexSegment(bad)).toThrow();
    expect(() => decodeIndexSegment(deflateSync(strToU8(JSON.stringify({ ...seg, entries: [] }))))).toThrow();
  });
});

describe('union winner rule', () => {
  const p = (mode: SegmentPrecedence['mode'], createdAt: string, hash: string): SegmentPrecedence => ({ mode, createdAt, hash });
  const cases: [SegmentPrecedence, SegmentPrecedence, 1 | -1][] = [
    [p('exact', '2020', 'a'), p('compact', '2030', 'z'), 1],
    [p('compact', '2030', 'z'), p('exact', '2020', 'a'), -1],
    [p('compact', '2020', 'a'), p('tiny', '2030', 'z'), 1],
    [p('tiny', '2030', 'z'), p('exact', '2010', 'a'), -1],
    [p('exact', '2026-02', 'a'), p('exact', '2026-01', 'z'), 1],
    [p('tiny', '2026-01', 'z'), p('tiny', '2026-02', 'a'), -1],
    [p('exact', '2026', 'b'), p('exact', '2026', 'a'), 1],
    [p('compact', '2026', 'a'), p('compact', '2026', 'b'), -1],
  ];
  it.each(cases)('%o vs %o -> %i', (a, b, sign) => {
    expect(Math.sign(compareSegmentPrecedence(a, b))).toBe(sign);
    expect(Math.sign(compareSegmentPrecedence(b, a))).toBe(-sign);
  });
  it('is 0 only for the same segment', () => {
    expect(compareSegmentPrecedence(p('exact', 'x', 'h'), p('exact', 'x', 'h'))).toBe(0);
  });
});

describe('helpers', () => {
  it('sniffs magic', () => {
    expect(sniffImageMime(fakeImage('png', 20))).toBe('image/png');
    expect(sniffImageMime(fakeImage('webp', 20))).toBe('image/webp');
    expect(sniffImageMime(fakeImage('jpeg', 20))).toBe('image/jpeg');
    expect(sniffImageMime(fakeImage('gif', 20))).toBe('image/gif');
    expect(sniffImageMime(strToU8('hello world!'))).toBeNull();
  });
  it('maps extensions', () => {
    expect(mimeFromPath('a/b.PNG')).toBe('image/png');
    expect(mimeFromPath('a/b.jpg')).toBe('image/jpeg');
    expect(mimeFromPath('a.dir/b')).toBeNull();
  });
  it('names content by first 16 hex of sha256', async () => {
    // sha256("abc") = ba7816bf8f01cfea...
    expect(await contentName(strToU8('abc'))).toBe('ba7816bf8f01cfea');
  });
  it('parses markers and rejects non-markers', () => {
    expect(parseMarker(strToU8(JSON.stringify({ format: 'windrose-tiles', major: 1, packId: 'x' }))).packId).toBe('x');
    expect(() => parseMarker(strToU8('{'))).toThrow();
    expect(() => parseMarker(strToU8(JSON.stringify({ format: 'other', major: 1, packId: 'x' })))).toThrow();
  });
});
