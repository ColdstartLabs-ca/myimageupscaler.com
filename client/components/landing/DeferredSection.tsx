'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface IDeferredSectionProps {
  children: ReactNode;
  fallback: ReactNode;
  rootMargin?: string;
}

/**
 * Keep a crawlable, geometry-preserving fallback in the document until the
 * section is close to the viewport. Unsupported browsers render the section
 * immediately so the content remains available without IntersectionObserver.
 */
export function DeferredSection({
  children,
  fallback,
  rootMargin = '300px 0px',
}: IDeferredSectionProps): JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible) return;

    const section = sectionRef.current;
    if (!section) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return <div ref={sectionRef}>{isVisible ? children : fallback}</div>;
}
