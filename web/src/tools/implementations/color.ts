import { z } from 'zod';
import { type LocalTool } from '../types';

export const colorTool: LocalTool = {
  name: 'convert_color',
  description: 'Convert colors between Hex, RGB, and HSL formats',
  parameters: z.object({
    color: z.string().describe('The color string to convert (e.g., "#FF5733", "rgb(255, 87, 51)")'),
    to: z.enum(['hex', 'rgb', 'hsl']).describe('The target format'),
  }),
  execute: ({ color, to }: { color: string; to: 'hex' | 'rgb' | 'hsl' }) => {
    // Helper to parse hex
    const parseHex = (hex: string) => {
      const cleanHex = hex.replace('#', '');
      const r = parseInt(cleanHex.substring(0, 2), 16);
      const g = parseInt(cleanHex.substring(2, 4), 16);
      const b = parseInt(cleanHex.substring(4, 6), 16);
      return { r, g, b };
    };

    // Helper to parse rgb/rgba
    const parseRgb = (rgb: string) => {
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) throw new Error('Invalid RGB format');
      return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
    };

    // Determine input format and get RGB values
    let r, g, b;
    if (color.startsWith('#')) {
      ({ r, g, b } = parseHex(color));
    } else if (color.startsWith('rgb')) {
      ({ r, g, b } = parseRgb(color));
    } else {
      throw new Error('Unsupported input format. Please use Hex (#RRGGBB) or RGB (rgb(r, g, b))');
    }

    // Convert keys to target format
    if (to === 'hex') {
      const toHex = (c: number) => c.toString(16).padStart(2, '0').toUpperCase();
      return { result: `#${toHex(r)}${toHex(g)}${toHex(b)}` };
    } else if (to === 'rgb') {
      return { result: `rgb(${r}, ${g}, ${b})` };
    } else if (to === 'hsl') {
      const rNorm = r / 255;
      const gNorm = g / 255;
      const bNorm = b / 255;
      const max = Math.max(rNorm, gNorm, bNorm);
      const min = Math.min(rNorm, gNorm, bNorm);
      let h = 0, s = 0, l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
          case gNorm: h = (bNorm - rNorm) / d + 2; break;
          case bNorm: h = (rNorm - gNorm) / d + 4; break;
        }
        h /= 6;
      }

      return { result: `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)` };
    }
  },
};
