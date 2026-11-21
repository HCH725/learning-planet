/**
 * Minimal content contract. Worlds that are not in this phase are metadata only:
 * they carry no route and are rendered as non-interactive cards.
 */
export type WorldMeta = {
  id: string;
  title: string;
  route: string;
  icon: string;
  enabled: boolean;
  audience: 'preschool' | 'general';
};

export type ZoneMeta = {
  id: 'forest' | 'bubbles' | 'music' | 'shapes';
  title: string;
  route: string;
  icon: string;
  enabled: boolean;
  /** Short, non-reading-dependent hint shown as an accessible label only. */
  hint: string;
};

export const WORLDS: WorldMeta[] = [
  {
    id: 'preschool',
    title: '學齡前幼兒樂園',
    route: '/world/preschool',
    icon: '🧸',
    enabled: true,
    audience: 'preschool',
  },
  { id: 'science', title: '科學世界', route: '', icon: '🔭', enabled: false, audience: 'general' },
  { id: 'language', title: '語言世界', route: '', icon: '🈶', enabled: false, audience: 'general' },
  { id: 'ai', title: 'AI 世界', route: '', icon: '🤖', enabled: false, audience: 'general' },
  { id: 'finance', title: '金融世界', route: '', icon: '💠', enabled: false, audience: 'general' },
];

export const PRESCHOOL_ZONES: ZoneMeta[] = [
  {
    id: 'forest',
    title: '動物森林',
    route: '/world/preschool/forest',
    icon: '🌳',
    enabled: true,
    hint: '點動物、餵食物',
  },
  { id: 'bubbles', title: '彩色泡泡', route: '/world/preschool/bubbles', icon: '🫧', enabled: true, hint: '點破泡泡、畫彩虹' },
  { id: 'music', title: '小小音樂屋', route: '/world/preschool/music', icon: '🎵', enabled: true, hint: '敲木琴、打鼓、搖鈴' },
  { id: 'shapes', title: '形狀花園', route: '/world/preschool/shapes', icon: '🔺', enabled: true, hint: '拼形狀、種花' },
];

export function enabledWorlds(): WorldMeta[] {
  return WORLDS.filter((world) => world.enabled);
}
