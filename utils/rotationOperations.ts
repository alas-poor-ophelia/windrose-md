// Standard rotation positions (45° increments)
const ROTATION_STEPS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const ROTATION_INCREMENT = 45;

/**
 * Get the next rotation value in the cycle.
 * Handles non-standard values by snapping to 0°.
 */
function getNextRotation(currentRotation: number): number {
	const currentIndex = ROTATION_STEPS.indexOf(currentRotation as typeof ROTATION_STEPS[number]);
	if (currentIndex === -1) {
		// Non-standard value, snap to 0°
		return ROTATION_STEPS[0];
	}
	return ROTATION_STEPS[(currentIndex + 1) % ROTATION_STEPS.length];
}

/**
 * Rotate by increment (for bulk operations).
 * Works with any current value, not just standard positions.
 */
function rotateByIncrement(currentRotation: number): number {
	return (currentRotation + ROTATION_INCREMENT) % 360;
}

return { ROTATION_STEPS, ROTATION_INCREMENT, getNextRotation, rotateByIncrement };
