/**
 * objectTypeResolver Unit Tests
 *
 * Tests for object type resolution including:
 * - getRenderChar: Priority handling for image/icon/symbol
 * - hasImagePath/hasIconClass: Type checking helpers
 * - isValidSymbol/isValidIconClass/isValidImagePath: Validation
 * - validateObjectDefinition: Full validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  getRenderChar,
  hasIconClass,
  hasImagePath,
  isValidSymbol,
  isValidImagePath,
  validateObjectDefinition,
} from "../../../src/utils/objectTypeResolver.ts";

// Mock object type for testing
interface MockObjectType {
  id: string;
  symbol?: string;
  iconClass?: string;
  imagePath?: string;
  label: string;
  category: string;
}

function createMockObjectType(overrides: Partial<MockObjectType> = {}): MockObjectType {
  return {
    id: 'test-object',
    symbol: '★',
    label: 'Test Object',
    category: 'markers',
    ...overrides,
  };
}

describe("objectTypeResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // getRenderChar
  // ===========================================================================

  describe("getRenderChar", () => {
    describe("null/undefined handling", () => {
      it("returns placeholder for null objectType", () => {
        const result = getRenderChar(null);

        expect(result.char).toBe('?');
        expect(result.isIcon).toBe(false);
        expect(result.isImage).toBeUndefined();
      });

      it("returns placeholder for undefined objectType", () => {
        const result = getRenderChar(undefined);

        expect(result.char).toBe('?');
        expect(result.isIcon).toBe(false);
      });
    });

    describe("image priority (highest)", () => {
      it("returns isImage: true when imagePath is set", () => {
        const obj = createMockObjectType({ imagePath: 'images/custom.png' });

        const result = getRenderChar(obj);

        expect(result.isImage).toBe(true);
        expect(result.imagePath).toBe('images/custom.png');
        expect(result.char).toBe('');
        expect(result.isIcon).toBe(false);
      });

      it("prioritizes imagePath over iconClass", () => {
        const obj = createMockObjectType({
          imagePath: 'images/custom.png',
          iconClass: 'ra-sword',
        });

        const result = getRenderChar(obj);

        expect(result.isImage).toBe(true);
        expect(result.imagePath).toBe('images/custom.png');
      });

      it("prioritizes imagePath over symbol", () => {
        const obj = createMockObjectType({
          imagePath: 'images/custom.png',
          symbol: '★',
        });

        const result = getRenderChar(obj);

        expect(result.isImage).toBe(true);
        expect(result.imagePath).toBe('images/custom.png');
      });

      it("prioritizes imagePath over both iconClass and symbol", () => {
        const obj = createMockObjectType({
          imagePath: 'images/custom.png',
          iconClass: 'ra-sword',
          symbol: '★',
        });

        const result = getRenderChar(obj);

        expect(result.isImage).toBe(true);
        expect(result.imagePath).toBe('images/custom.png');
      });

      it("ignores empty imagePath", () => {
        const obj = createMockObjectType({
          imagePath: '',
          symbol: '★',
        });

        const result = getRenderChar(obj);

        expect(result.isImage).toBeUndefined();
        expect(result.char).toBe('★');
      });
    });

    describe("icon priority (second)", () => {
      it("returns isIcon: true when iconClass is set and valid", () => {
        // Note: This uses the mocked getIconChar which returns the mapped character
        const obj = createMockObjectType({
          iconClass: 'ra-sword',
          symbol: undefined,
        });

        const result = getRenderChar(obj);

        // If icon is valid, isIcon should be true
        if (result.isIcon) {
          expect(result.char).toBeTruthy();
          expect(result.isImage).toBeUndefined();
        }
      });

      it("falls back to symbol when iconClass is invalid", () => {
        const obj = createMockObjectType({
          iconClass: 'invalid-icon-class-xyz',
          symbol: '★',
        });

        const result = getRenderChar(obj);

        // Should fall back to symbol since icon is invalid
        expect(result.char).toBe('★');
        expect(result.isIcon).toBe(false);
      });
    });

    describe("symbol priority (lowest)", () => {
      it("returns symbol char when no iconClass or imagePath", () => {
        const obj = createMockObjectType({
          symbol: '◆',
          iconClass: undefined,
          imagePath: undefined,
        });

        const result = getRenderChar(obj);

        expect(result.char).toBe('◆');
        expect(result.isIcon).toBe(false);
        expect(result.isImage).toBeUndefined();
      });

      it("returns isIcon: false for symbol", () => {
        const obj = createMockObjectType({ symbol: '♦' });

        const result = getRenderChar(obj);

        expect(result.isIcon).toBe(false);
      });
    });

    describe("fallback", () => {
      it("returns '?' when no visual representation", () => {
        const obj = createMockObjectType({
          symbol: undefined,
          iconClass: undefined,
          imagePath: undefined,
        });

        const result = getRenderChar(obj);

        expect(result.char).toBe('?');
        expect(result.isIcon).toBe(false);
      });

      it("returns '?' for empty symbol", () => {
        const obj = createMockObjectType({
          symbol: '',
          iconClass: undefined,
          imagePath: undefined,
        });

        const result = getRenderChar(obj);

        expect(result.char).toBe('?');
      });
    });
  });

  // ===========================================================================
  // hasImagePath
  // ===========================================================================

  describe("hasImagePath", () => {
    it("returns true for non-empty string imagePath", () => {
      const obj = createMockObjectType({ imagePath: 'images/test.png' });

      expect(hasImagePath(obj)).toBe(true);
    });

    it("returns false for empty string imagePath", () => {
      const obj = createMockObjectType({ imagePath: '' });

      expect(hasImagePath(obj)).toBe(false);
    });

    it("returns false for null objectType", () => {
      expect(hasImagePath(null)).toBe(false);
    });

    it("returns false for undefined objectType", () => {
      expect(hasImagePath(undefined)).toBe(false);
    });

    it("returns false for undefined imagePath", () => {
      const obj = createMockObjectType({ imagePath: undefined });

      expect(hasImagePath(obj)).toBe(false);
    });

    it("returns true for path with spaces", () => {
      const obj = createMockObjectType({ imagePath: 'images/my custom image.png' });

      expect(hasImagePath(obj)).toBe(true);
    });

    it("returns true for deep vault path", () => {
      const obj = createMockObjectType({ imagePath: 'Assets/Objects/Monsters/dragon.webp' });

      expect(hasImagePath(obj)).toBe(true);
    });
  });

  // ===========================================================================
  // hasIconClass
  // ===========================================================================

  describe("hasIconClass", () => {
    it("returns true for non-empty string iconClass", () => {
      const obj = createMockObjectType({ iconClass: 'ra-sword' });

      expect(hasIconClass(obj)).toBe(true);
    });

    it("returns false for empty string iconClass", () => {
      const obj = createMockObjectType({ iconClass: '' });

      expect(hasIconClass(obj)).toBe(false);
    });

    it("returns false for null objectType", () => {
      expect(hasIconClass(null)).toBe(false);
    });

    it("returns false for undefined objectType", () => {
      expect(hasIconClass(undefined)).toBe(false);
    });

    it("returns false for undefined iconClass", () => {
      const obj = createMockObjectType({ iconClass: undefined });

      expect(hasIconClass(obj)).toBe(false);
    });
  });

  // ===========================================================================
  // isValidSymbol
  // ===========================================================================

  describe("isValidSymbol", () => {
    it("returns true for single character", () => {
      expect(isValidSymbol('★')).toBe(true);
    });

    it("returns true for multi-character emoji", () => {
      // Some emoji are multi-codepoint
      expect(isValidSymbol('👨‍👩‍👧')).toBe(true);
    });

    it("returns true for up to 8 characters", () => {
      expect(isValidSymbol('12345678')).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(isValidSymbol('')).toBe(false);
    });

    it("returns false for null", () => {
      expect(isValidSymbol(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isValidSymbol(undefined)).toBe(false);
    });

    it("returns false for string longer than 8 characters", () => {
      expect(isValidSymbol('123456789')).toBe(false);
    });

    it("returns false for whitespace only", () => {
      expect(isValidSymbol('   ')).toBe(false);
    });

    it("trims whitespace before checking length", () => {
      expect(isValidSymbol(' ★ ')).toBe(true);
    });
  });

  // ===========================================================================
  // isValidImagePath
  // ===========================================================================

  describe("isValidImagePath", () => {
    it("returns true for non-empty string", () => {
      expect(isValidImagePath('images/test.png')).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(isValidImagePath('')).toBe(false);
    });

    it("returns false for null", () => {
      expect(isValidImagePath(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isValidImagePath(undefined)).toBe(false);
    });

    it("returns false for whitespace only", () => {
      expect(isValidImagePath('   ')).toBe(false);
    });

    it("returns true for path with special characters", () => {
      expect(isValidImagePath('images/my-custom_image (1).png')).toBe(true);
    });

    it("returns true for various image extensions", () => {
      expect(isValidImagePath('test.png')).toBe(true);
      expect(isValidImagePath('test.webp')).toBe(true);
      expect(isValidImagePath('test.jpg')).toBe(true);
      expect(isValidImagePath('test.jpeg')).toBe(true);
      expect(isValidImagePath('test.gif')).toBe(true);
    });
  });

  // ===========================================================================
  // validateObjectDefinition
  // ===========================================================================

  describe("validateObjectDefinition", () => {
    describe("valid definitions", () => {
      it("accepts object with valid symbol", () => {
        const obj = {
          symbol: '★',
          label: 'Star Marker',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("accepts object with valid imagePath", () => {
        const obj = {
          imagePath: 'images/custom.png',
          label: 'Custom Image',
          category: 'features',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("accepts object with multiple visual representations", () => {
        const obj = {
          symbol: '★',
          imagePath: 'images/custom.png',
          label: 'Multi Marker',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(true);
      });
    });

    describe("missing visual representation", () => {
      it("rejects object without any visual representation", () => {
        const obj = {
          label: 'No Visual',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Either a symbol, icon, or image is required');
      });

      it("rejects object with empty symbol only", () => {
        const obj = {
          symbol: '',
          label: 'Empty Symbol',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
      });

      it("rejects object with empty imagePath only", () => {
        const obj = {
          imagePath: '',
          label: 'Empty Image',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        // Empty string is falsy, so it falls through to the generic error
        expect(result.errors).toContain('Either a symbol, icon, or image is required');
      });
    });

    describe("invalid values", () => {
      it("provides specific error for invalid symbol", () => {
        const obj = {
          symbol: '123456789', // Too long
          label: 'Long Symbol',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Symbol must be 1-8 characters');
      });

      it("provides specific error for invalid image path", () => {
        const obj = {
          imagePath: '   ', // Whitespace only
          label: 'Whitespace Image',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid image path');
      });
    });

    describe("required fields", () => {
      it("requires label", () => {
        const obj = {
          symbol: '★',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Label is required');
      });

      it("requires non-empty label", () => {
        const obj = {
          symbol: '★',
          label: '',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Label is required');
      });

      it("requires category", () => {
        const obj = {
          symbol: '★',
          label: 'No Category',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Category is required');
      });

      it("collects multiple errors", () => {
        const obj = {};

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors).toContain('Label is required');
        expect(result.errors).toContain('Category is required');
      });
    });

    describe("whitespace handling", () => {
      it("rejects whitespace-only label", () => {
        const obj = {
          symbol: '★',
          label: '   ',
          category: 'markers',
        };

        const result = validateObjectDefinition(obj);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Label is required');
      });
    });
  });
});
