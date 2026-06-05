import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isValidAge(date: Date | string | null | undefined): boolean {
  if (!date) return true;
  const now = new Date();
  const dob = new Date(date);
  const age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const adjustedAge =
    monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())
      ? age - 1
      : age;
  return adjustedAge >= 14 && adjustedAge <= 99;
}
