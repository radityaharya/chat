import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import mermaid from 'mermaid';
import { Button } from '@/components/ui/button';
import { DownloadIcon, Loader2Icon, Maximize2Icon, XIcon, ZoomInIcon, ZoomOutIcon, RotateCcwIcon, ImageIcon, FileCodeIcon, WandSparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MermaidProps {
  chart: string;
  className?: string;
  showDownload?: boolean;
  isLoading?: boolean;
  /** Callback when user clicks "Fix" button, receives the error message */
  onFix?: (errorMessage: string) => void;
  /** Whether the AI is currently fixing the diagram */
  isFixing?: boolean;
}

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
});


interface MermaidOverlayProps {
  svg: string;
  isOpen: boolean;
  onClose: () => void;
}

function MermaidOverlay({ svg, isOpen, onClose }: MermaidOverlayProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset zoom/pan when opening
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = 0.1;
    // Zoom toward the mouse position would be ideal but complex, centering for now
    const newScale = Math.min(Math.max(0.1, scale - Math.sign(e.deltaY) * scaleFactor), 5);
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setScale(s => Math.min(s + 0.2, 5));
  const handleZoomOut = () => setScale(s => Math.max(0.1, s - 0.2));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <div className="flex items-center gap-1 bg-background/50 backdrop-blur-sm border rounded-md p-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOutIcon className="size-4" />
          </Button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="size-8" onClick={handleZoomIn} title="Zoom In">
            <ZoomInIcon className="size-4" />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="size-8" onClick={handleReset} title="Reset View">
            <RotateCcwIcon className="size-4" />
          </Button>
        </div>
        <Button variant="secondary" size="icon" className="size-10 rounded-full" onClick={onClose} title="Close (Esc)">
          <XIcon className="size-5" />
        </Button>
      </div>

      {/* Main Content */}
      <div
        className="w-full h-full overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
          className="pointer-events-none" // prevent interacting with svg internal elements to ensure drag works smoothly
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body
  );
}

export function Mermaid({ chart, className, showDownload = false, isLoading = false, onFix, isFixing = false }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const renderIdRef = useRef(0);
  const [debouncedChart, setDebouncedChart] = useState(chart);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedChart(chart);
    }, isLoading ? 300 : 100);

    return () => clearTimeout(handler);
  }, [chart, isLoading]);

  useEffect(() => {
    // If no chart content, ensure we aren't in loading state
    if (!debouncedChart.trim()) {
      setIsRendering(false);
      setSvg('');
      return;
    }

    let mounted = true;

    const render = async () => {
      if (!containerRef.current) return;

      setIsRendering(true);
      // We don't clear error here immediately if loading, to avoid flashing error
      // while typing. But we do want to clear it if we succeed.

      // Increment render ID to ensure unique IDs for each render
      renderIdRef.current += 1;
      const id = `mermaid-${Date.now()}-${renderIdRef.current}`;

      try {
        // Validate mermaid syntax before rendering to prevent error diagrams
        await mermaid.parse(debouncedChart);

        // Render the mermaid chart
        // Note: mermaid.render requires the element to be present in the DOM for some operations,
        // but creates its own temporary element.
        const { svg: renderedSvg } = await mermaid.render(id, debouncedChart);

        if (mounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        console.error('Mermaid rendering error:', err);

        if (mounted) {
          // If we are loading (streaming), we suppress syntax errors to avoid flickering
          // bad states while the AI is typing. We only show errors if:
          // 1. We are done loading
          // 2. It's not a syntax error (something else went wrong)
          const isSyntaxError = err.message?.includes('Parse error') || err.message?.includes('Syntax error') || err.message?.includes('str.startsWith is not a function');

          if (!isLoading || !isSyntaxError) {
            if (isSyntaxError) {
              setError(`Syntax error: ${err.message}`);
            } else {
              setError(err.message || 'Failed to render diagram');
            }
          }
        }
      } finally {
        if (mounted) {
          setIsRendering(false);
        }
      }
    };

    render();

    return () => {
      mounted = false;
    };
  }, [debouncedChart, isLoading]);

  const handleDownload = () => {
    if (!svg) return;

    // Create a blob from the SVG
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-diagram-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = async () => {
    if (!svg || !containerRef.current) return;

    const svgContainer = containerRef.current.querySelector('svg');
    if (!svgContainer) return;

    // Clone the SVG to manipulate it without affecting the display
    const clonedSvg = svgContainer.cloneNode(true) as SVGSVGElement;

    // Better approach: We explicitly set width/height based on viewBox to ensure it matches aspect ratio
    const viewBox = svgContainer.getAttribute('viewBox');
    let width = svgContainer.clientWidth || 800;
    let height = svgContainer.clientHeight || 600;

    if (viewBox) {
      const parts = viewBox.split(/\s+|,/);
      if (parts.length === 4) {
        width = parseFloat(parts[2]);
        height = parseFloat(parts[3]);
      }
    }

    clonedSvg.setAttribute('width', width.toString());
    clonedSvg.setAttribute('height', height.toString());

    // Explicitly set the xmlns if missing
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Serialize the SVG
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);

    // Use base64 data URI to avoid tainted canvas issues
    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
    const url = `data:image/svg+xml;base64,${svgBase64}`;

    const img = new Image();
    img.src = url;

    img.onload = () => {
      const scale = 2; // High resolution
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw background first for handling transparency in dark mode
      // This matches the app's dark theme background
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const pngUrl = canvas.toDataURL('image/png');

        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `mermaid-diagram-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        console.error("Failed to convert canvas to blob:", err);
      }
    };
  };

  // If we have an error and we are not loading, show message
  // If we are loading and have an error, we try to show previous SVG if it exists,
  // otherwise we might show the error or nothing.
  // Here we choose to show the error if we don't have an SVG to fallback to.
  if (error && !svg) {
    return (
      <div className={cn('p-4 bg-destructive/10 text-destructive rounded-md text-sm', className)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold mb-1">Failed to render diagram</p>
            <p className="text-xs opacity-90 break-words">{error}</p>
          </div>
          {onFix && (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 gap-1.5 h-7 text-xs"
              onClick={() => onFix(error)}
              disabled={isFixing}
            >
              {isFixing ? (
                <>
                  <Loader2Icon className="size-3 animate-spin" />
                  Fixing...
                </>
              ) : (
                <>
                  <WandSparklesIcon className="size-3" />
                  Fix with AI
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn('relative group', className)}>
        {isRendering && !svg ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2Icon className="size-6 animate-spin mr-2" />
            <span className="text-sm">Rendering diagram...</span>
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              className={cn("mermaid-container overflow-auto", isRendering && "opacity-50 transition-opacity")}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              {svg && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setIsFullScreen(true)}
                  title="Full Screen"
                >
                  <Maximize2Icon className="size-3.5" />
                </Button>
              )}
              {showDownload && svg && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      title="Download"
                    >
                      <DownloadIcon className="size-3" />
                      Download
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleDownload} className="text-xs">
                      <FileCodeIcon className="size-3.5 mr-2" />
                      Download SVG
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPng} className="text-xs">
                      <ImageIcon className="size-3.5 mr-2" />
                      Download PNG
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </>
        )}
      </div>

      <MermaidOverlay
        svg={svg}
        isOpen={isFullScreen}
        onClose={() => setIsFullScreen(false)}
      />
    </>
  );
}
