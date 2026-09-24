import { useState } from 'preact/hooks';
import type { Unit } from '../lib/types';
import { parseNumber } from '../lib/nutrition';
import { roundAmount } from '../lib/dish';

export const fmtAmount = (n: number) => String(roundAmount(n));

/**
 * A small grams/ml field. While it has focus it keeps exactly what was typed
 * (so "1" on the way to "150" doesn't get reformatted); otherwise it shows the value.
 */
export function AmountInput({
  id,
  value,
  unit,
  label,
  onChange,
}: {
  id: string;
  value: number;
  unit: Unit;
  label: string;
  onChange: (amount: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div class="input-wrap grams">
      <label for={id} class="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text ?? fmtAmount(value)}
        onFocus={(e) => {
          setText(fmtAmount(value));
          (e.target as HTMLInputElement).select();
        }}
        onInput={(e) => {
          const t = (e.target as HTMLInputElement).value.replace(/[^\d.,]/g, '');
          setText(t);
          onChange(roundAmount(parseNumber(t)));
        }}
        onBlur={() => setText(null)}
      />
      <span class="input-suffix">{unit}</span>
    </div>
  );
}
