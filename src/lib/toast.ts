import { useEffect, useState } from 'preact/hooks';

export interface Toast {
  id: number;
  createdAt: number;
  message: string;
  action?: { label: string; run: () => void };
}

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(message: string, action?: Toast['action']) {
  current = { id: nextId++, createdAt: Date.now(), message, action };
  clearTimeout(timer);
  timer = setTimeout(dismissToast, action ? 5000 : 2600);
  emit();
}

/** Called on navigation: drop toasts that belong to the screen being left. */
export function dismissStaleToast(maxAgeMs = 1000) {
  if (current && Date.now() - current.createdAt > maxAgeMs) dismissToast();
}

export function dismissToast() {
  current = null;
  clearTimeout(timer);
  emit();
}

export function useToast(): Toast | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return current;
}
