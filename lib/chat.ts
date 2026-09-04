export type VoicePreset = {
  characterPitch: 12 | 15 | 18;
  voiceStyle: 'sharp' | 'balanced' | 'soft';
  excited: boolean;
};
export type Profile = { nickname: string; color: string; preset: VoicePreset };

const adjectives = ['신난', '졸린', '용감한', '수상한', '반짝이는', '못생긴', '느긋한', '재빠른', '시끄러운', '말랑한'];
const species = ['잉클링', '옥토링'];
const colors = ['#f35ca5', '#8f69ff', '#55cfff', '#65d36e', '#ff9e45', '#f1d74d', '#ea5c5c', '#48d1b0'];
const alphabet = 'abcdefghijklmnopqrstuvwxyz';
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

export function createProfile(): Profile {
  return {
    nickname: `${pick(adjectives)} ${pick(species)} ${Math.floor(Math.random() * 10)}`,
    color: pick(colors),
    preset: { characterPitch: pick([12, 15, 18] as const), voiceStyle: pick(['sharp', 'balanced', 'soft'] as const), excited: Math.random() < 0.5 },
  };
}

export function scrambleMessage(input: string) {
  return Array.from(input.trim(), (character) => (/\s/u.test(character) ? character : alphabet[Math.floor(Math.random() * alphabet.length)])).join('');
}
