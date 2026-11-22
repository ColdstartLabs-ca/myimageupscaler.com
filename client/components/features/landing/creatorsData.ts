import { Camera, Pencil, ShoppingCart } from 'lucide-react';

export const CREATOR_CARDS = [
  {
    title: 'Photographers',
    description:
      'Recover lost details, enlarge shots for prints, and impress your clients with studio-quality results.',
    image: '/landing/creators/photographers.webp',
    alt: 'Photographer capturing a mountain landscape',
    icon: Camera,
    iconClass: 'text-accent',
  },
  {
    title: 'Ecommerce',
    description:
      'Make your products stand out with crisp, high-resolution images that increase conversions.',
    image: '/landing/creators/ecommerce.webp',
    alt: 'Detailed black headphones product image',
    icon: ShoppingCart,
    iconClass: 'text-secondary',
  },
  {
    title: 'Designers',
    description:
      'Get the perfect assets for your designs, presentations, and digital projects at any scale.',
    image: '/landing/creators/designers.webp',
    alt: 'Vivid abstract design artwork with flowing color',
    icon: Pencil,
    iconClass: 'text-accent',
  },
] as const;

export type ICreatorCard = (typeof CREATOR_CARDS)[number];
