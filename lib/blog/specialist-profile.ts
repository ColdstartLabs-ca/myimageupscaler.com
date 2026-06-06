export interface IBlogSpecialistProfile {
  name: string;
  role: string;
  description: string;
  bio: string;
  image: string;
  url: string;
  xHandle: string;
  xUrl: string;
  expertise: string[];
  sameAs: string[];
}

export const BLOG_SPECIALIST_PROFILE: IBlogSpecialistProfile = {
  name: 'Joao Furtado',
  role: 'AI Image Upscaling Specialist',
  description:
    'Joao reviews image upscaling guides for practical workflow accuracy, image quality tradeoffs, and tool-specific recommendations.',
  bio: 'Joao is the founder of MyImageUpscaler and an AI image upscaling specialist. He tests every guide against real upscaling workflows — comparing model outputs, evaluating sharpness and artifact tradeoffs, and validating tool recommendations before publication.',
  image: '/authors/joao-furtado.webp',
  url: '/about',
  xHandle: 'joaocoldstart',
  xUrl: 'https://x.com/joaocoldstart',
  expertise: [
    'AI image upscaling',
    'Model comparison',
    'Photo restoration',
    'E-commerce image prep',
  ],
  sameAs: ['https://x.com/joaocoldstart'],
};
