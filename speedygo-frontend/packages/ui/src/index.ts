import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const buttonVariants = {
  primary: 'bg-orange-500 hover:bg-orange-600 text-white',
  secondary: 'bg-white border border-gray-200 text-gray-900 hover:border-gray-300',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  admin: 'bg-slate-800 hover:bg-slate-900 text-white',
} as const;

export const cardClasses = 'bg-white rounded-xl border border-gray-100';

