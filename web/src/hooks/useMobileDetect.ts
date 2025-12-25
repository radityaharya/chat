import { useEffect, useState } from 'react';

export interface MobileDetect {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
}

/**
 * Custom hook to detect mobile devices and screen sizes.
 * Updates on window resize.
 */
export function useMobileDetect(): MobileDetect {
  const [detect, setDetect] = useState<MobileDetect>(() => {
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isTouchDevice: false,
      };
    }

    const width = window.innerWidth;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    return {
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
      isTouchDevice,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      setDetect({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        isTouchDevice,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return detect;
}
