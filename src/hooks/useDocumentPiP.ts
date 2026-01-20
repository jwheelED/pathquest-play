import { useState, useCallback } from 'react';

// Extend Window interface for Document Picture-in-Picture API
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
    };
  }
  interface DocumentPictureInPictureEvent extends Event {
    window: Window;
  }
}

export interface UseDocumentPiPOptions {
  width?: number;
  height?: number;
  onClose?: () => void;
}

export const useDocumentPiP = (options: UseDocumentPiPOptions = {}) => {
  const { width = 320, height = 220, onClose } = options;
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [isSupported] = useState(() => 'documentPictureInPicture' in window);

  const openPiP = useCallback(async (): Promise<Window | null> => {
    if (!isSupported) {
      console.error('Document Picture-in-Picture API not supported');
      return null;
    }

    try {
      const newWindow = await window.documentPictureInPicture!.requestWindow({
        width,
        height,
      });

      // Copy stylesheets to PiP window
      const copyStyles = () => {
        // Copy all stylesheets
        [...document.styleSheets].forEach((styleSheet) => {
          try {
            if (styleSheet.cssRules) {
              const cssRules = [...styleSheet.cssRules]
                .map((rule) => rule.cssText)
                .join('');
              const style = document.createElement('style');
              style.textContent = cssRules;
              newWindow.document.head.appendChild(style);
            }
          } catch (e) {
            // External stylesheets may throw SecurityError
            if (styleSheet.href) {
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = styleSheet.href;
              newWindow.document.head.appendChild(link);
            }
          }
        });

        // Copy any inline styles from head
        document.querySelectorAll('style').forEach((style) => {
          const clonedStyle = style.cloneNode(true) as HTMLStyleElement;
          newWindow.document.head.appendChild(clonedStyle);
        });
      };

      copyStyles();

      // Set up close handler
      newWindow.addEventListener('pagehide', () => {
        setPipWindow(null);
        onClose?.();
      });

      setPipWindow(newWindow);
      return newWindow;
    } catch (error) {
      console.error('Failed to open Picture-in-Picture window:', error);
      return null;
    }
  }, [isSupported, width, height, onClose]);

  const closePiP = useCallback(() => {
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
    }
  }, [pipWindow]);

  return {
    isSupported,
    pipWindow,
    openPiP,
    closePiP,
    isOpen: !!pipWindow,
  };
};
