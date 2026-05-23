import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateLobbyId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateAvatarUrl(seed: string) {
  // Hardcoded premium colors matching the website's dark and vibrant aesthetic
  const matchedColors = [
    'a855f7', // Purple
    '8b5cf6', // Violet
    '6366f1', // Indigo
    '3b82f6', // Blue
    '06b6d4', // Cyan
    '10b981', // Emerald
    'ec4899', // Pink
    'f43f5e', // Rose
    'f97316', // Orange
  ];
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${matchedColors.join(',')}&shapeColor=f8fafc`;
}
