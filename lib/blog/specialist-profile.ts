export interface IBlogSpecialistProfile {
  name: string;
  role: string;
  description: string;
  image: string;
  url: string;
}

export const BLOG_SPECIALIST_PROFILE: IBlogSpecialistProfile = {
  name: 'Joao Furtado',
  role: 'AI Image Upscaling Specialist',
  description:
    'Joao reviews image upscaling guides for practical workflow accuracy, image quality tradeoffs, and tool-specific recommendations.',
  image: '/authors/joao-furtado.webp',
  url: '/about',
};
