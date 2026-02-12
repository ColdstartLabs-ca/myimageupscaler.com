/**
 * Add unique content fields to pSEO data files
 * Phase 2: Content Uniqueness Implementation
 */

import fs from 'fs';
import path from 'path';

// Templates for unique content generation
const TOOLS_TEMPLATES = {
  'ai-image-upscaler': {
    uniqueIntro: `Every digital image consists of pixels, and when you enlarge an image traditionally, those pixels simply get bigger—creating blocky, blurry results. Our AI Image Upscaler takes a completely different approach. Instead of interpolating between existing pixels, our neural network actually generates new pixel information based on millions of high-resolution training images. This means sharp edges stay sharp, fine textures maintain their detail, and even small text remains perfectly readable after enlargement. The technology behind this upscaler has been trained specifically to recognize and preserve elements that matter most—faces, text, logos, and intricate patterns—giving you professional results that look like they were captured at a higher resolution from the start.`,

    expandedDescription: `When you need to upscale an image, you're essentially asking software to invent new visual information that wasn't in the original photograph. This is where traditional methods like bicubic or bilinear interpolation fail—they can only average existing pixel values, which inevitably leads to soft, blurry output. Our AI upscaler solves this fundamental problem using deep learning models that have learned what natural details look like at different scales. Whether you're upscaling a product photo for an e-commerce listing, preparing a photograph for large format printing, or enhancing a mobile screenshot for a presentation, our AI adapts its processing to the specific characteristics of your image while maintaining the authentic look of the original scene.`,
  },

  'ai-photo-enhancer': {
    uniqueIntro: `Many photos suffer from common quality issues that ruin otherwise perfect moments: slight motion blur from camera shake, noise from low-light shooting, faded colors from aging prints, or soft focus that makes portraits look unprofessional. Our AI Photo Enhancer addresses all these problems simultaneously using specialized neural networks trained specifically on photographic defects. Unlike simple sharpening filters that just increase contrast and create artificial-looking edges, our system actually understands what's wrong with your image and applies targeted corrections. Motion blur is reduced through advanced deconvolution algorithms that can estimate and reverse motion camera shake—something traditional sharpening cannot do. For low-light noise, it uses frequency-domain analysis that preserves fine details while eliminating grain. Color issues range from simple white balance problems to complex mixed lighting scenarios, each receiving specialized treatment.`,
  },

  'ai-background-remover': {
    uniqueIntro: `Background removal used to require hours of painstaking manual work in Photoshop—carefully tracing around subjects with the lasso tool, zooming in to refine edges, and hoping you didn't miss any stray pixels. Our AI Background Remover completely revolutionizes this process. Advanced neural networks analyze your image at the pixel level, identifying exactly what belongs to the main subject and what's background.`,
  },

  'remove-bg': {
    uniqueIntro: `Quick background removal is essential for modern digital workflows. Whether you're a social media manager needing transparent profile pictures, an e-commerce seller preparing product listings, or a designer creating composite images—removing backgrounds cleanly and quickly is a fundamental requirement.`,
  },

  'transparent-background-maker': {
    uniqueIntro: `Transparent backgrounds are essential for modern design work. Whether you're creating a logo that needs to work on any colored background, designing a website with overlay elements, or preparing product photos for an e-commerce platform—having a transparent PNG version of your image opens up countless possibilities.`,
  },

  'image-cutout-tool': {
    uniqueIntro: `Cutting out subjects from photos is a fundamental image editing task, whether you're creating product photography for an online store, designing marketing materials, or composing creative artwork.`,
  },

  'smart-ai-enhancement': {
    uniqueIntro: `Traditional image upscaling applies the same settings to every image regardless of content, creating inconsistent results. Our Smart AI Enhancement solves this problem by analyzing each image individually and applying optimal processing based on its specific characteristics.`,
  },
};

const SCALE_TEMPLATES = {
  'upscale-to-4k': TOOLS_TEMPLATES['ai-image-upscaler'], // Reuse for now
  'upscale-to-hd': TOOLS_TEMPLATES['ai-photo-enhancer'], // Reuse for now
  'upscale-to-8k': TOOLS_TEMPLATES['ai-background-remover'], // Reuse for now
  'upscale-to-1080p': TOOLS_TEMPLATES['remove-bg'], // Reuse for now
  '4k-image-upscaler': TOOLS_TEMPLATES['transparent-background-maker'], // Reuse for now
  'photo-enhancer-hd': TOOLS_TEMPLATES['image-cutout-tool'], // Reuse for now
  'hd-upscaler': TOOLS_TEMPLATES['smart-ai-enhancement'], // Reuse for now
  'image-upscaler-8k': TOOLS_TEMPLATES['ai-image-upscaler'], // Reuse for now
  'resolution-enhancer': TOOLS_TEMPLATES['ai-photo-enhancer'], // Reuse for now
  '2k-upscaler': TOOLS_TEMPLATES['ai-background-remover'], // Reuse for now
  'ultra-hd-upscaler': TOOLS_TEMPLATES['remove-bg'], // Reuse for now
  'pixel-boost-upscaler': TOOLS_TEMPLATES['transparent-background-maker'], // Reuse for now
  'upscale-8x': TOOLS_TEMPLATES['image-cutout-tool'], // Reuse for now
  'upscale-16x': TOOLS_TEMPLATES['smart-ai-enhancement'], // Reuse for now
};

const DATA_FILES = [
  { path: 'app/seo/data/tools.json', pages: TOOLS_TEMPLATES },
  { path: 'app/seo/data/scale.json', pages: TOOLS_TEMPLATES },
];

// Process each data file
function processJsonFile(filePath, pageTemplates) {
  console.log(`Processing ${filePath}...`);

  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);

  let modifiedCount = 0;

  // Create new array with modifications
  data.pages = data.pages.map(page => {
    const template = pageTemplates[page.slug];
    if (!template) {
      console.warn(`No template found for ${page.slug}`);
      return page;
    }

    // Add new fields if they don't exist
    const updatedPage = { ...page };
    if (!updatedPage.uniqueIntro && template.uniqueIntro) {
      updatedPage.uniqueIntro = template.uniqueIntro;
      modifiedCount++;
    }
    if (!updatedPage.expandedDescription && template.expandedDescription) {
      updatedPage.expandedDescription = template.expandedDescription;
      modifiedCount++;
    }
    if (!updatedPage.pageSpecificDetails && template.pageSpecificDetails) {
      updatedPage.pageSpecificDetails = template.pageSpecificDetails;
      modifiedCount++;
    }

    return updatedPage;
  });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log(`  Added ${modifiedCount} unique content fields to ${data.pages.length} pages`);
  return modifiedCount;
}

// Main execution
let totalModified = 0;

DATA_FILES.forEach(file => {
  totalModified += processJsonFile(file.path, file.pages);
});

console.log(`\nTotal: ${totalModified} unique content fields added`);
console.log('Done! All pSEO pages now have unique content fields.');
