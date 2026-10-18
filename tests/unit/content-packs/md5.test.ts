/** md5Hex (RFC 1321) against known vectors: Dungeondraft thumbnail names depend on it. */
import { describe, it, expect } from 'vitest';
import { md5Hex } from '../../../src/content-packs/pckParser';

describe('md5Hex', () => {
	it('hashes the empty string', () => {
		expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
	});

	it('hashes "abc"', () => {
		expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
	});

	it('hashes the quick brown fox', () => {
		expect(md5Hex('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
	});

	it('hashes a 1000-character input spanning many blocks', () => {
		expect(md5Hex('a'.repeat(1000))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8');
	});

	it('hashes the UTF-8 bytes of a non-ASCII string', () => {
		expect(md5Hex('res://packs/Ünïcødé/thumbnails/drache-\u{1F409}.png'))
			.toBe('1411da7faafdd3364958e562b7a47b6f');
	});
});
