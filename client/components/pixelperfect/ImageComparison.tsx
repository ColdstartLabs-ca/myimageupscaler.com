import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Download, ZoomIn, ZoomOut } from 'lucide-react';
import Button from '@client/components/pixelperfect/Button';

interface IImageComparisonProps {
  beforeUrl: string;
  afterUrl: string;
  onDownload: () => void;
}

const ImageComparison: React.FC<IImageComparisonProps> = ({ beforeUrl, afterUrl, onDownload }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent | React.MouseEvent | TouchEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const clientX =
        'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

      setSliderPosition(percentage);
    },
    [isDragging]
  );

  // Global event listeners for dragging outside the container
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.addEventListener('touchmove', handleMouseMove as any);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.removeEventListener('touchmove', handleMouseMove as any);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const toggleZoom = () => {
    setZoom(prev => (prev === 1 ? 2 : 1));
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Enhanced Successfully
          </span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={toggleZoom}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            title="Toggle Zoom"
          >
            {zoom === 1 ? <ZoomIn size={20} /> : <ZoomOut size={20} />}
          </button>
          <Button variant="primary" size="sm" icon={<Download size={16} />} onClick={onDownload}>
            Download Result
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full h-[500px] bg-[url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjNmNGY2Ii8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmM2Y0ZjYiLz48L3N2Zz4=)] bg-repeat overflow-hidden cursor-col-resize select-none group"
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        {/* Images container with zoom support */}
        <div
          className="relative w-full h-full transition-transform duration-300 ease-in-out origin-center flex items-center justify-center bg-slate-100"
          style={{ transform: `scale(${zoom})` }}
        >
          {/* After Image (Background) */}
          <img
            src={afterUrl}
            alt="Enhanced image result"
            className="absolute top-0 left-0 w-full h-full object-contain object-center select-none"
            draggable={false}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />

          {/* Before Image (Foreground - Clipped) */}
          <div
            className="absolute top-0 left-0 w-full h-full select-none overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <img
              src={beforeUrl}
              alt="Original image for comparison"
              className="absolute top-0 left-0 w-full h-full object-contain object-center"
              draggable={false}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </div>

        {/* Slider Handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_rgba(0,0,0,0.3)] cursor-col-resize flex items-center justify-center z-10 transform -translate-x-1/2"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
            <ArrowLeftRight size={16} className="text-indigo-600" />
          </div>
        </div>

        {/* Labels */}
        <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
          Original
        </div>
        <div className="absolute bottom-4 right-4 bg-indigo-600/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
          Enhanced
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default ImageComparison;
