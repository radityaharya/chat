import { useEffect } from 'react';

export function useViewportHeight() {
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    // Set initial value
    setVH();

    // Update on resize (includes orientation change and keyboard appearance)
    let timeoutId: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(setVH, 100);
    };

    window.addEventListener('resize', handleResize);
    // Also listen to orientationchange for better mobile support
    window.addEventListener('orientationchange', setVH);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', setVH);
      clearTimeout(timeoutId);
    };
  }, []);
}
