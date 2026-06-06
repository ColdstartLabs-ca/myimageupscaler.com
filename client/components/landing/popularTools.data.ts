export const POPULAR_TOOLS = [
  {
    href: '/tools/ai-image-upscaler',
    label: 'AI Image Upscaler',
    desc: 'Enlarge to 4K without quality loss',
  },
  {
    href: '/tools/ai-photo-enhancer',
    label: 'Image Quality Enhancer',
    desc: 'Fix blur, noise, and restore photos',
  },
  {
    href: '/tools/transparent-background-maker',
    label: 'Transparent Background Maker',
    desc: 'Remove backgrounds and export PNG',
  },
  {
    href: '/formats/upscale-avif-images',
    label: 'AVIF Upscaler',
    desc: 'Upscale next-gen AVIF images',
  },
  {
    href: '/free',
    label: 'Free Tools',
    desc: 'Start with free credits — no card needed',
  },
  {
    href: '/tools/ai-background-remover',
    label: 'AI Background Remover',
    desc: 'Cut out subjects in one click',
  },
] as const;

export type TPopularTool = (typeof POPULAR_TOOLS)[number];
