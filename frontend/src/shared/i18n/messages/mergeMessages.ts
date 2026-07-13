import type { MessageDictionary } from './types';

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void
  ? I
  : never;

type Simplify<T> = { [K in keyof T]: T[K] };

export type MergedMessages<T extends readonly MessageDictionary[]> = Simplify<
  UnionToIntersection<T[number]>
>;

export type ExtendedMessages<
  Base extends MessageDictionary,
  Overrides extends readonly MessageDictionary[],
> = Simplify<Omit<Base, keyof MergedMessages<Overrides>> & MergedMessages<Overrides>>;

export function mergeMessages<const T extends readonly MessageDictionary[]>(
  ...sections: T
): MergedMessages<T> {
  const merged: MessageDictionary = {};

  for (const section of sections) {
    for (const [key, value] of Object.entries(section)) {
      if (key in merged) {
        throw new Error(`Duplicate translation key detected: ${key}`);
      }
      merged[key] = value;
    }
  }

  return merged as MergedMessages<T>;
}

export function extendMessages<
  Base extends MessageDictionary,
  const T extends readonly MessageDictionary[],
>(base: Base, ...overrides: T): ExtendedMessages<Base, T> {
  return {
    ...base,
    ...mergeMessages(...overrides),
  } as ExtendedMessages<Base, T>;
}
