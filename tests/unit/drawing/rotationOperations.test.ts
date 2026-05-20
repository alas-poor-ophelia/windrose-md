import { describe, it, expect } from "vitest";
import {
	ROTATION_STEPS,
	ROTATION_INCREMENT,
	getNextRotation,
	rotateByIncrement,
} from "../../../src/drawing/rotationOperations";

describe("rotationOperations", () => {
	describe("constants", () => {
		it("has 8 rotation steps", () => {
			expect(ROTATION_STEPS).toHaveLength(8);
		});

		it("has correct rotation steps", () => {
			expect([...ROTATION_STEPS]).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
		});

		it("has 45 degree increment", () => {
			expect(ROTATION_INCREMENT).toBe(45);
		});
	});

	describe("getNextRotation", () => {
		it("cycles through all 8 positions", () => {
			let rotation = 0;
			const visited: number[] = [rotation];

			for (let i = 0; i < 7; i++) {
				rotation = getNextRotation(rotation);
				visited.push(rotation);
			}

			expect(visited).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
		});

		it("wraps from 315 back to 0", () => {
			expect(getNextRotation(315)).toBe(0);
		});

		it("snaps non-standard values to 0", () => {
			expect(getNextRotation(30)).toBe(0);
			expect(getNextRotation(100)).toBe(0);
			expect(getNextRotation(-45)).toBe(0);
			expect(getNextRotation(360)).toBe(0);
		});

		it("handles each standard position correctly", () => {
			expect(getNextRotation(0)).toBe(45);
			expect(getNextRotation(45)).toBe(90);
			expect(getNextRotation(90)).toBe(135);
			expect(getNextRotation(135)).toBe(180);
			expect(getNextRotation(180)).toBe(225);
			expect(getNextRotation(225)).toBe(270);
			expect(getNextRotation(270)).toBe(315);
			expect(getNextRotation(315)).toBe(0);
		});
	});

	describe("rotateByIncrement", () => {
		it("adds 45 degrees", () => {
			expect(rotateByIncrement(0)).toBe(45);
			expect(rotateByIncrement(45)).toBe(90);
			expect(rotateByIncrement(90)).toBe(135);
		});

		it("wraps at 360", () => {
			expect(rotateByIncrement(315)).toBe(0);
			expect(rotateByIncrement(330)).toBe(15);
		});

		it("handles non-standard values", () => {
			expect(rotateByIncrement(30)).toBe(75);
			expect(rotateByIncrement(100)).toBe(145);
		});

		it("completes full cycle in 8 increments", () => {
			let rotation = 0;
			for (let i = 0; i < 8; i++) {
				rotation = rotateByIncrement(rotation);
			}
			expect(rotation).toBe(0);
		});
	});
});
