import { waitForRender } from '$lib/util/autoSync';
import { inputState, updateCodeStore, validatedState } from '$lib/util/state.svelte';
import { logEvent } from '$lib/util/stats';
import { version as FAVersion } from '@fortawesome/fontawesome-free/package.json';
import dayjs from 'dayjs';
import { toBase64 } from 'js-base64';

const FONT_AWESOME_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FAVersion}/css/all.min.css`;

type Exporter = (context: CanvasRenderingContext2D, image: HTMLImageElement) => () => void;

const getFileName = (extension: string) =>
  `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

/**
 * Fix text clipping in exported SVG for hand-drawn (rough) mode.
 * svg2roughjs copies foreignObject elements but their height is often insufficient,
 * causing text bottom edges to be cut off regardless of language.
 */
const fixForeignObjectClipping = (svg: HTMLElement) => {
  const foreignObjects = svg.querySelectorAll('foreignObject');
  foreignObjects.forEach((foreignObj) => {
    const currentHeight = parseFloat(foreignObj.getAttribute('height') || '0');
    if (currentHeight <= 0) return;

    const currentY = parseFloat(foreignObj.getAttribute('y') || '0');
    const newHeight = currentHeight * 1.5;
    const heightDiff = newHeight - currentHeight;

    foreignObj.setAttribute('height', newHeight.toString());
    foreignObj.setAttribute('y', (currentY - heightDiff / 2).toString());

    // Ensure inner HTML elements are vertically centered within the expanded area
    const htmlElements = foreignObj.querySelectorAll('div, span, p');
    htmlElements.forEach((htmlEl) => {
      const el = htmlEl as HTMLElement;
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.height = '100%';
    });
  });
};

const getSvgElement = () => {
  const svgElement = document.querySelector('#container svg')?.cloneNode(true) as HTMLElement;
  if (svgElement) {
    svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svgElement.style.transform = '';
    svgElement.style.opacity = '1';
    svgElement.style.position = '';
    svgElement.style.display = 'block';
  }
  return svgElement;
};

const getBase64SVG = (svg?: HTMLElement, width?: number, height?: number): string => {
  if (svg) {
    // Prevents the SVG size of the interface from being changed
    svg = svg.cloneNode(true) as HTMLElement;
  }
  if (height) {
    svg?.setAttribute('height', `${height}px`);
  }
  if (width) {
    svg?.setAttribute('width', `${width}px`);
  }
  // Workaround https://stackoverflow.com/questions/28690643/firefox-error-rendering-an-svg-image-to-html5-canvas-with-drawimage

  if (!svg) {
    svg = getSvgElement();
  }

  if (validatedState.current.rough) {
    fixForeignObjectClipping(svg);
  }

  svg.style.backgroundColor = window
    .getComputedStyle(document.body)
    .getPropertyValue('--background');

  const svgString = svg.outerHTML
    .replaceAll('<br>', '<br/>')
    .replaceAll(/<img([^>]*)>/g, (m, g: string) => `<img ${g} />`);

  return toBase64(`<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="${FONT_AWESOME_URL}" type="text/css"?>
${svgString}`);
};

const simulateDownload = (download: string, href: string): void => {
  const a = document.createElement('a');
  a.download = download;
  a.href = href;
  a.click();
  a.remove();
};

const exportImage = async (event: Event | undefined, exporter: Exporter) => {
  updateCodeStore({ panZoom: false });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await waitForRender();
  const canvas = document.createElement('canvas');
  const svg = document.querySelector<HTMLElement>('#container svg');
  if (!svg) {
    throw new Error('svg not found');
  }

  const box = svg.getBoundingClientRect();

  // In rough mode, SVG has width/height="100%" so getBoundingClientRect returns
  // the container size, not the actual diagram size. Use viewBox dimensions instead.
  const svgEl = svg as unknown as SVGSVGElement;
  const viewBox = svgEl.viewBox?.baseVal;
  const contentWidth = viewBox && viewBox.width > 0 ? viewBox.width : box.width;
  const contentHeight = viewBox && viewBox.height > 0 ? viewBox.height : box.height;

  if (imageSize.mode === 'width') {
    const ratio = contentHeight / contentWidth;
    canvas.width = imageSize.size;
    canvas.height = imageSize.size * ratio;
  } else if (imageSize.mode === 'height') {
    const ratio = contentWidth / contentHeight;
    canvas.width = imageSize.size * ratio;
    canvas.height = imageSize.size;
  } else {
    const multiplier = 2;
    canvas.width = contentWidth * multiplier;
    canvas.height = contentHeight * multiplier;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('context not found');
  }

  context.fillStyle = window.getComputedStyle(document.body).getPropertyValue('--background');
  context.fillRect(0, 0, canvas.width, canvas.height);

  const image = new Image();
  image.addEventListener('load', () => {
    exporter(context, image)();
    updateCodeStore({ panZoom: true });
  });
  image.src = `data:image/svg+xml;base64,${getBase64SVG(svg, canvas.width, canvas.height)}`;
  // Fallback to set panZoom to true after 2 seconds
  // This is a workaround for the case when the image is not loaded
  setTimeout(() => {
    if (!inputState.panZoom) {
      updateCodeStore({ panZoom: true });
    }
  }, 2000);
  event?.stopPropagation();
  event?.preventDefault();
};

const downloadImage: Exporter = (context, image) => {
  return () => {
    const { canvas } = context;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    simulateDownload(
      getFileName('png'),
      canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream')
    );
  };
};

const isClipboardAvailable = (): boolean => {
  return Object.prototype.hasOwnProperty.call(window, 'ClipboardItem');
};

const clipboardCopy: Exporter = (context, image) => {
  return () => {
    const { canvas } = context;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      try {
        if (!blob) {
          throw new Error('blob is empty');
        }
        void navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
      } catch (error) {
        console.error(error);
      }
    });
  };
};

// PNG export sizing, shared between the Share panel controls and the exporter.
class ImageSizeState {
  mode = $state<'auto' | 'width' | 'height'>('auto');
  size = $state(1080);
}

export const imageSize = new ImageSizeState();

export const onCopyClipboard = async (event?: Event) => {
  if (!isClipboardAvailable()) {
    return;
  }
  await exportImage(event, clipboardCopy);
  logEvent('copyClipboard');
};

export const onDownloadPNG = async (event: Event) => {
  await exportImage(event, downloadImage);
  logEvent('download', {
    type: 'png'
  });
};

export const onDownloadSVG = () => {
  simulateDownload(getFileName('svg'), `data:image/svg+xml;base64,${getBase64SVG()}`);
  logEvent('download', {
    type: 'svg'
  });
};

export { isClipboardAvailable };
