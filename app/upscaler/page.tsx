import Workspace from '@/components/pixelperfect/Workspace/Workspace';

export default function UpscalerPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">AI Image Upscaler</h1>
        <p className="text-slate-600">
          Enhance and upscale your images using advanced AI technology
        </p>
      </div>
      <Workspace />
    </div>
  );
}
