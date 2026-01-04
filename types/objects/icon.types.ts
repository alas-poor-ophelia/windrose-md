/**
 * icon.types.ts - Type definitions for RPGAwesome icons
 */

/** Icon category definition */
export interface IconCategory {
  id: string;
  label: string;
  order: number;
}

/** Icon data definition */
export interface IconData {
  char: string;
  label: string;
  category: string;
}

/** Icon with class name */
export interface IconWithClass extends IconData {
  iconClass: string;
}

/** Icon map type - maps icon class names to icon data */
export type IconMap = Record<string, IconData>;
